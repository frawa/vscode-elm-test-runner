import * as json from 'jsonc-parser'

export function parseOutput(line: string): Output | undefined {
    const errors: json.ParseError[] = []
    const parsed: any = json.parse(line, errors)
    const nojson = errors.find(
        (e) => e.error === json.ParseErrorCode.InvalidSymbol
    )
    if (errors.length > 0 && nojson) {
        return { type: 'message', line }
    }
    return parseResult(parsed)
}

export function parseResult(parsed: any): Result | undefined {
    const messages: string[] =
        parsed.messages?.map((m: string) => String(m)) ?? []

    if (parsed.event === 'runStart') {
        const event: Event = {
            tag: 'runStart',
            testCount: Number.parseInt(parsed.testCount),
        }
        return { type: 'result', event, messages }
    }
    if (parsed.event === 'runComplete') {
        const event: Event = {
            tag: 'runComplete',
            passed: Number.parseInt(parsed.passed),
            failed: Number.parseInt(parsed.failed),
            duration: Number.parseInt(parsed.duration),
        }
        return { type: 'result', event, messages }
    }
    if (parsed.event === 'testCompleted') {
        const status: TestStatus | undefined = parseStatus(parsed)
        if (status) {
            const event: Event = {
                tag: 'testCompleted',
                labels: parsed.labels,
                duration: Number.parseInt(parsed.duration),
                status,
            }
            return { type: 'result', event, messages }
        }
    }
}

function parseStatus(parsed: any): TestStatus | undefined {
    if (parsed.status === 'pass') {
        return { tag: 'pass' }
    } else if (parsed.status === 'todo') {
        const comment = String(parsed.failures[0])
        return { tag: 'todo', comment }
    } else if (parsed.status === 'fail') {
        const failures = parsed.failures.map(parseFailure)
        return { tag: 'fail', failures }
    }
}

function parseFailure(failure: any): Failure | undefined {
    if (typeof failure.reason.data === 'object') {
        let data = failure.reason.data
        if (data.comparison) {
            return {
                tag: 'comparison',
                actual: evalStringLiteral(String(data.actual)),
                expected: evalStringLiteral(String(data.expected)),
                comparison: String(data.comparison),
            }
        } else {
            const dataMap = Object.keys(data)
                .map((key) => [String(key), String(data[key])])
                .reduce(
                    (obj, [key, value]) => Object.assign(obj, { [key]: value }),
                    {}
                )
            return {
                tag: 'data',
                data: dataMap,
            }
        }
    } else if (failure.reason.data) {
        return {
            tag: 'message',
            message: String(failure.reason.data),
        }
    } else if (failure.message) {
        return {
            tag: 'message',
            message: String(failure.message),
        }
    }
}

export function parseErrorOutput(line: string): ErrorOutput {
    var errors: json.ParseError[] = []
    var output: CompileErrors = json.parse(line, errors)
    var nojson = errors.find(
        (e) => e.error === json.ParseErrorCode.InvalidSymbol
    )
    if (errors.length > 0 && nojson) {
        return { type: 'message', line }
    }
    return output
}

export type Output = Message | Result

export type ErrorOutput = Message | CompileErrors

export type Message = {
    type: 'message'
    line: string
}

export type Result = {
    type: 'result'
    event: Event
    messages: string[]
}

export type Event =
    | { tag: 'runStart'; testCount: number }
    | EventTestCompleted
    | { tag: 'runComplete'; passed: number; failed: number; duration: number }

export type EventTestCompleted = {
    tag: 'testCompleted'
    labels: string[]
    duration: number
    status: TestStatus
}

export type TestStatus =
    | { tag: 'pass' }
    | { tag: 'todo'; comment: string }
    | { tag: 'fail'; failures: Failure[] }

export type Failure =
    | { tag: 'message'; message: string }
    | {
          tag: 'comparison'
          comparison: string
          actual: string
          expected: string
      }
    | { tag: 'data'; data: { [key: string]: string } }

export type CompileErrors = {
    type: 'compile-errors'
    errors: Error[]
}

export type Error = {
    path: string
    name: string
    problems: Problem[]
}

export type Problem = {
    title: string
    region: Region
    message: MessagePart[]
}

export type Region = {
    start: Position
    end: Position
}

export type Position = {
    line: number
    column: number
}

export type MessagePart = string | StyledString

export type StyledString = {
    bold?: boolean
    underline?: boolean
    color?: string
    string: string
}

export function buildMessage(result: Result): string | undefined {
    if (result.event.tag === 'testCompleted') {
        if (result.event.status.tag === 'fail') {
            const lines = result.event.status.failures.flatMap((failure) => {
                switch (failure.tag) {
                    case 'comparison':
                        return [
                            failure.actual,
                            '| ' + failure.comparison,
                            failure.expected,
                        ]
                    case 'data':
                        return Object.keys(failure.data).map(
                            (key) => `${key}: ${failure.data[key]}`
                        )
                    case 'message':
                        return [failure.message]
                }
            })
            return result.messages.concat(lines).join('\n')
        }
        return result.messages.join('\n')
    }
}

function evalStringLiteral(value: string): string {
    if (value && value.startsWith('"')) {
        return eval(value).toString()
    }
    return value
}

export function buildErrorMessage(output: ErrorOutput): string {
    switch (output.type) {
        case 'message':
            return output.line
        case 'compile-errors':
            return buildCompileErrorsMessage(output.errors)
    }
}

function buildCompileErrorsMessage(errors: Error[]): string {
    return errors.map(buildCompileErrorMessage).join('\n\n')
}

function buildCompileErrorMessage(error: Error): string {
    return [`${error.path}`]
        .concat(error.problems.map(buildProblemMessage))
        .join('\n\n')
}

function buildProblemMessage(problem: Problem): string {
    return [`${buildRegion(problem.region)} ${problem.title}\n`]
        .concat(problem.message.map(getMessageString))
        .join('')
}

function buildRegion(region: Region): string {
    return `${buildPosition(region.start)}-${buildPosition(region.end)}`
}

function buildPosition(pos: Position): string {
    return `${pos.line}:${pos.column}`
}

function getMessageString(message: MessagePart): string {
    return typeof message === 'string' ? message : message['string']
}
