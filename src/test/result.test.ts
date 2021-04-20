import { expect } from 'chai'

import {
    parseOutput,
    Result,
    buildMessage,
    parseErrorOutput,
    Output,
    EventTestCompleted,
    parseResult,
} from '../result'

function expectResult(
    output: Output | undefined,
    fun: (result: Result) => void
) {
    expect(output?.type).to.eq('result')
    if (output?.type === 'result') {
        fun(output)
    }
}

function expectEvent(
    result: Result | undefined,
    fun: (event: EventTestCompleted) => void
) {
    expect(result?.event.tag).to.eq('testCompleted')
    if (result?.event.tag === 'testCompleted') {
        fun(result.event)
    }
}

describe('Result', () => {
    describe('parse results', () => {
        it('one line pass', () => {
            let line =
                '{"event":"testCompleted","status":"pass","labels":["suite","nested","test"],"failures":[],"duration":"13"}'
            const output = parseOutput(line)
            expectResult(output, (result) => {
                expectEvent(result, (event) => {
                    expect(event.status.tag).to.eql('pass')
                    expect(event.labels).to.eql(['suite', 'nested', 'test'])
                    expect(event.duration).to.eql(13)
                })
            })
        })

        it('one line todo', () => {
            const line =
                '{"event":"testCompleted","status":"todo","labels":["suite"],"failures":["todo comment"],"duration":"1"}'
            const output = parseOutput(line)
            expectResult(output, (result) => {
                expectEvent(result, (event) => {
                    expect(event.labels).to.eql(['suite'])
                    expect(event.duration).to.eql(1)
                    expect(event.status.tag).to.eql('todo')
                    if (event.status.tag === 'todo') {
                        expect(event.status.comment).to.eql('todo comment')
                    }
                })
            })
        })

        it('a message', () => {
            let line = 'a message'
            let output = parseOutput(line)
            expect(output?.type).to.eq('message')
            if (output?.type === 'message') {
                expect(output.line).to.eql(line)
            }
        })

        it('boken json', () => {
            let line = '{ boken'
            let output = parseOutput(line)
            expect(output?.type).to.eq('message')
            if (output?.type === 'message') {
                expect(output.line).to.eql(line)
            }
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
                errors: [
                    {
                        path: 'path/to/file.elm',
                        name: 'a name',
                        problems: [
                            {
                                title: 'THE ERROR',
                                region: {
                                    start: { line: 17, column: 5 },
                                    end: { line: 17, column: 10 },
                                },
                                message: ['some text', { string: 'more text' }],
                            },
                        ],
                    },
                ],
            }
            expect(output).to.eql(expected)
        })
    })

    describe('build message', () => {
        it('empty', () => {
            const raw: any = {
                event: '',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [],
                messages: [],
                duration: '0',
            }
            const result = parseResult(raw)
            expect(result).to.eq(undefined)
            // const message = buildMessage(result)
            // expect(message).to.eq('')
        })
        it('with messages', () => {
            const raw: any = {
                event: 'testCompleted',
                status: 'pass',
                labels: ['suite', 'test'],
                failures: [],
                messages: ['hello', 'world'],
                duration: '13',
            }
            const result: Result = {
                type: 'result',
                event: {
                    tag: 'testCompleted',
                    labels: ['suite', 'test'],
                    status: { tag: 'pass' },
                    duration: 13,
                },
                messages: ['hello', 'world'],
            }
            expect(parseResult(raw)).to.eql(result)
            const message = buildMessage(result)
            expect(message).to.eq('hello\nworld')
        })

        it('with failure with string reason', () => {
            const raw: any = {
                event: 'testCompleted',
                status: 'fail',
                labels: ['suite', 'test'],
                failures: [
                    {
                        message: 'boom',
                        reason: {
                            data: 'broken',
                        },
                    },
                ],
                messages: [],
                duration: '0',
            }
            const result: Result = {
                type: 'result',
                messages: [],
                event: {
                    tag: 'testCompleted',
                    labels: ['suite', 'test'],
                    duration: 0,
                    status: {
                        tag: 'fail',
                        failures: [
                            {
                                tag: 'message',
                                message: 'broken',
                            },
                        ],
                    },
                },
            }
            expect(parseResult(raw)).to.eql(result)
            const message = buildMessage(result)
            expect(message).to.eq('broken')
        })

        it('with failure without raeson data', () => {
            const raw: any = {
                type: 'result',
                event: 'testCompleted',
                status: 'fail',
                labels: ['suite', 'test'],
                failures: [
                    {
                        message: 'boom',
                        reason: {
                            data: undefined,
                        },
                    },
                ],
                messages: [],
                duration: '0',
            }
            const result: Result = {
                type: 'result',
                messages: [],
                event: {
                    tag: 'testCompleted',
                    labels: ['suite', 'test'],
                    duration: 0,
                    status: {
                        tag: 'fail',
                        failures: [
                            {
                                tag: 'message',
                                message: 'boom',
                            },
                        ],
                    },
                },
            }
            expect(parseResult(raw)).to.eql(result)
            const message = buildMessage(result)
            expect(message).to.eq('boom')
        })

        it('with failure with comparison data', () => {
            const raw: any = {
                event: 'testCompleted',
                status: 'fail',
                labels: ['suite', 'test'],
                failures: [
                    {
                        message: 'boom',
                        reason: {
                            data: {
                                comparison: 'compare',
                                actual: 'actual',
                                expected: 'expected',
                            },
                        },
                    },
                ],
                messages: [],
                duration: '0',
            }
            const result: Result = {
                type: 'result',
                messages: [],
                event: {
                    tag: 'testCompleted',
                    labels: ['suite', 'test'],
                    duration: 0,
                    status: {
                        tag: 'fail',
                        failures: [
                            {
                                tag: 'comparison',
                                comparison: 'compare',
                                actual: 'actual',
                                expected: 'expected',
                            },
                        ],
                    },
                },
            }
            expect(parseResult(raw)).to.eql(result)
            const message = buildMessage(result)
            expect(message).to.eq(
                ['actual', '| compare', 'expected'].join('\n')
            )
        })

        it('with failure with string literal in comparison data', () => {
            const raw: any = {
                event: 'testCompleted',
                status: 'fail',
                labels: ['suite', 'test'],
                failures: [
                    {
                        message: 'boom',
                        reason: {
                            data: {
                                comparison: 'compare',
                                actual: '"multi\\nline\\nactual"',
                                expected: '"quoted \\"expected\\""',
                            },
                        },
                    },
                ],
                messages: [],
                duration: '0',
            }
            const result: Result = {
                type: 'result',
                messages: [],
                event: {
                    tag: 'testCompleted',
                    labels: ['suite', 'test'],
                    duration: 0,
                    status: {
                        tag: 'fail',
                        failures: [
                            {
                                tag: 'comparison',
                                comparison: 'compare',
                                actual: 'multi\nline\nactual',
                                expected: 'quoted "expected"',
                            },
                        ],
                    },
                },
            }
            expect(parseResult(raw)).to.eql(result)
            const message = buildMessage(result)
            expect(message).to.eq(
                [
                    'multi',
                    'line',
                    'actual',
                    '| compare',
                    'quoted "expected"',
                ].join('\n')
            )
        })

        it('with failure with other data', () => {
            const raw: any = {
                event: 'testCompleted',
                status: 'fail',
                labels: ['suite', 'test'],
                failures: [
                    {
                        message: 'boom',
                        reason: {
                            data: {
                                key1: 'value1',
                                key2: 'value2',
                            },
                        },
                    },
                ],
                messages: [],
                duration: '0',
            }
            const result: Result = {
                type: 'result',
                messages: [],
                event: {
                    tag: 'testCompleted',
                    labels: ['suite', 'test'],
                    duration: 0,
                    status: {
                        tag: 'fail',
                        failures: [
                            {
                                tag: 'data',
                                data: {
                                    key1: 'value1',
                                    key2: 'value2',
                                },
                            },
                        ],
                    },
                },
            }
            expect(parseResult(raw)).to.eql(result)
            const message = buildMessage(result)
            expect(message).to.eq(['key1: value1', 'key2: value2'].join('\n'))
        })
    })

    it('with message and failure with comparison data', () => {
        const raw: any = {
            event: 'testCompleted',
            status: 'fail',
            labels: ['suite', 'test'],
            failures: [
                {
                    message: 'boom',
                    reason: {
                        data: {
                            comparison: 'compare',
                            actual: 'actual',
                            expected: 'expected',
                        },
                    },
                },
            ],
            messages: ['broken'],
            duration: '0',
        }
        const result: Result = {
            type: 'result',
            messages: ['broken'],
            event: {
                tag: 'testCompleted',
                labels: ['suite', 'test'],
                duration: 0,
                status: {
                    tag: 'fail',
                    failures: [
                        {
                            tag: 'comparison',
                            comparison: 'compare',
                            actual: 'actual',
                            expected: 'expected',
                        },
                    ],
                },
            },
        }
        expect(parseResult(raw)).to.eql(result)
        const message = buildMessage(result)
        expect(message).to.eq(
            ['broken', 'actual', '| compare', 'expected'].join('\n')
        )
    })
})
