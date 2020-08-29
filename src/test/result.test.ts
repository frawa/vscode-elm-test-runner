import { expect } from 'chai';

import { parseTestResult, Result, buildMessage } from '../result'

describe('Result', () => {

    describe('parse results', () => {

        it('one line pass', () => {
            let line = '{"event":"testCompleted","status":"pass","labels":["suite","nested","test"],"failures":[],"duration":"13"}'
            let result = parseTestResult(line)

            if (typeof result !== 'string') {
                expect(result.event).to.eql('testCompleted')
                expect(result.status).to.eql('pass')
                expect(result.labels).to.eql(['suite', 'nested', 'test'])
                expect(result.failures).to.eql([])
                expect(result.duration).to.eql('13')
            } else {
                expect.fail("unexpected: " + result)
            }
        })

        it('one line todo', () => {
            let line = '{"event":"testCompleted","status":"todo","labels":["suite"],"failures":["todo comment"],"duration":"1"}'
            let result = parseTestResult(line)

            if (typeof result !== 'string') {
                expect(result.event).to.eql('testCompleted')
                expect(result.status).to.eql('todo')
                expect(result.labels).to.eql(['suite'])
                expect(result.failures).to.eql(['todo comment'])
                expect(result.duration).to.eql('1')
            } else {
                expect.fail("unexpected: " + result)
            }
        })

        it('a message', () => {
            let line = 'a message'
            let result = parseTestResult(line)
            expect(result).to.eql(line)
        })

        it('boken json', () => {
            let line = '{ boken'
            let result = parseTestResult(line)
            expect(result).to.eql(line)
        })

    })

    /*
        let result: Result = {
                    event: ''
                    , status: 'pass'
                    , labels: ['test']
                    , failures: [{
                        message: 'diffable failure',
                        reason: {
                            data: {
                                actual: 'actual',
                                expected: 'expected'
                            }
                        }
                    }]
                    , duration: '0'
                }
                let result: Result = {
                    event: ''
                    , status: 'fail'
                    , labels: ['suite', 'test']
                    , failures: [{
                        message: 'diffable failure',
                        reason: {
                            data: 'failure message'
                        }
                    }]
                    , duration: '0'
                }
    
    */

    describe('build message', () => {
        it('empty', () => {
            const result: Result = {
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