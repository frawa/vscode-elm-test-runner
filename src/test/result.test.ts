import { expect } from 'chai';

import { parseOutput, Result, buildMessage, Message, parseErrorOutput } from '../result'

describe('Result', () => {

    describe('parse results', () => {

        it('one line pass', () => {
            let line = '{"event":"testCompleted","status":"pass","labels":["suite","nested","test"],"failures":[],"duration":"13"}'
            const output = parseOutput(line)
            expect(output.type).to.eq('result')
            const result = output as Result
            expect(result.event).to.eql('testCompleted')
            expect(result.status).to.eql('pass')
            expect(result.labels).to.eql(['suite', 'nested', 'test'])
            expect(result.failures).to.eql([])
            expect(result.duration).to.eql('13')
        })

        it('one line todo', () => {
            const line = '{"event":"testCompleted","status":"todo","labels":["suite"],"failures":["todo comment"],"duration":"1"}'
            const output = parseOutput(line)
            expect(output.type).to.eq('result')
            const result = output as Result
            expect(result.event).to.eql('testCompleted')
            expect(result.status).to.eql('todo')
            expect(result.labels).to.eql(['suite'])
            expect(result.failures).to.eql(['todo comment'])
            expect(result.duration).to.eql('1')
        })

        it('a message', () => {
            let line = 'a message'
            let output = parseOutput(line)
            expect(output.type).to.eq('message')
            expect((output as Message).line).to.eql(line)
        })

        it('boken json', () => {
            let line = '{ boken'
            let result = parseOutput(line)
            expect(result.type).to.eq('message')
            expect((result as Message).line).to.eql(line)
        })

        it('compile errors', () => {
            let line = `
            {
                "type": "compile-errors",
                "errors": [{
                    "path": "path/to/file.elm",
                    "name": "a name",
                    "problems": [{
                        "title": "THE ERROR",
                        "region": {
                            "start": {
                                "line": 17,
                                "column": 5
                            },
                            "end": {
                                "line": 17,
                                "column": 10
                            }
                        },
                        "message": [
                            "some text",
                            { "string": "more text" }
                        ]
                    }]
                }]
            }
            `
            const output = parseErrorOutput(line)
            const expected = {
                type: 'compile-errors',
                errors: [{
                    path: 'path/to/file.elm',
                    name: 'a name',
                    problems: [{
                        title: 'THE ERROR',
                        region: {
                            start: { line: 17, column: 5 },
                            end: { line: 17, column: 10 }
                        },
                        message: [
                            'some text',
                            { "string": 'more text' }
                        ]
                    }]
                }]
            }
            expect(output).to.eql(expected)
        })

    })

    describe('build message', () => {
        it('empty', () => {
            const result: Result = {
                type: 'result',
                event: '',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [],
                messages: [],
                duration: '0',
            }
            const message = buildMessage(result);
            expect(message).to.eq('')
        })

        it('with messages', () => {
            const result: Result = {
                type: 'result',
                event: '',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [],
                messages: ['hello', 'world'],
                duration: '0',
            }
            const message = buildMessage(result);
            expect(message).to.eq('hello\nworld')
        })

        it('with failure with string reason', () => {
            const result: Result = {
                type: 'result',
                event: '',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [{
                    message: 'boom',
                    reason: {
                        data: 'broken'
                    }
                }],
                messages: [],
                duration: '0',
            }
            const message = buildMessage(result);
            expect(message).to.eq('broken')
        })

        it('with failure without raeson data', () => {
            const result: Result = {
                type: 'result',
                event: '',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [{
                    message: 'boom',
                    reason: {
                        data: undefined
                    }
                }],
                messages: [],
                duration: '0',
            }
            const message = buildMessage(result);
            expect(message).to.eq('boom')
        })

        it('with failure with comparison data', () => {
            const result: Result = {
                type: 'result',
                event: '',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [{
                    message: 'boom',
                    reason: {
                        data: {
                            comparison: 'compare',
                            actual: 'actual',
                            expected: 'expected',
                        }
                    }
                }],
                messages: [],
                duration: '0',
            }
            const message = buildMessage(result);
            expect(message).to.eq([
                'actual',
                '| compare',
                'expected'
            ].join('\n'))
        })

        it('with failure with string literal in comparison data', () => {
            const result: Result = {
                type: 'result',
                event: '',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [{
                    message: 'boom',
                    reason: {
                        data: {
                            comparison: 'compare',
                            actual: '"multi\\nline\\nactual"',
                            expected: '"quoted \\"expected\\""',
                        }
                    }
                }],
                messages: [],
                duration: '0',
            }
            const message = buildMessage(result);
            expect(message).to.eq([
                'multi',
                'line',
                'actual',
                '| compare',
                'quoted "expected"'
            ].join('\n'))
        })

        it('with failure with other data', () => {
            const result: Result = {
                type: 'result',
                event: '',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [{
                    message: 'boom',
                    reason: {
                        data: {
                            key1: 'value1',
                            key2: 'value2',
                        }
                    }
                }],
                messages: [],
                duration: '0',
            }
            const message = buildMessage(result);
            expect(message).to.eq([
                'key1: value1',
                'key2: value2',
            ].join('\n'))
        })
    });

    it('with message and failure with comparison data', () => {
        const result: Result = {
            type: 'result',
            event: '',
            status: 'pass',
            labels: ['suite', 'test'],
            failures: [{
                message: 'boom',
                reason: {
                    data: {
                        comparison: 'compare',
                        actual: 'actual',
                        expected: 'expected',
                    }
                }
            }],
            messages: ['broken'],
            duration: '0',
        }
        const message = buildMessage(result);
        expect(message).to.eq([
            'broken',
            'actual',
            '| compare',
            'expected'
        ].join('\n'))
    })

})