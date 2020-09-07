import * as json from 'jsonc-parser'

export function parseOutput(line: string): Output {
    var errors: json.ParseError[] = []
    var output: Output = json.parse(line, errors)
    var nojson = errors.find(e => e.error === json.ParseErrorCode.InvalidSymbol)
    if (errors.length > 0 && nojson) {
        return { type: 'message', line }
    }
    if (!output.type) {
        output.type = 'result'
    }
    return output;
}

export function parseErrorOutput(line: string): ErrorOutput {
    var errors: json.ParseError[] = []
    var output: CompileErrors = json.parse(line, errors)
    var nojson = errors.find(e => e.error === json.ParseErrorCode.InvalidSymbol)
    if (errors.length > 0 && nojson) {
        return { type: 'message', line }
    }
    return output;
}


export type Output = Message | Result

export type ErrorOutput = Message | CompileErrors

export type Message = {
    type: "message",
    line: string
}

export type Result = {
    type?: "result",
    event: string
    status: string
    labels: string[]
    failures: Failure[]
    messages: string[]
    duration: string,
    testCount?: number
}

export type Failure = {
    message: string
    reason: {
        data: any
    }
}

export type CompileErrors = {
    type: 'compile-errors',
    errors: Error[]
}

export type Error = {
    path: string,
    name: string,
    problems: Problem[]
}

export type Problem = {
    title: string,
    region: Region,
    message: MessagePart[]
}

export type Region = {
    start: Position,
    end: Position
}

export type Position = {
    line: number,
    column: number
}

export type MessagePart = string | StyledString

export type StyledString = {
    bold?: boolean,
    underline?: boolean,
    color?: string,
    'string': string
}

export function buildMessage(result: Result): string {
    let failureLines = (acc: string[], failure: Failure) => {
        if (typeof failure.reason.data === 'object') {
            let data = failure.reason.data
            if (data.comparison) {
                acc.push(evalStringLiteral(data.actual))
                acc.push(`| ${data.comparison}`)
                acc.push(evalStringLiteral(data.expected))
            } else {
                for (let key in data) {
                    acc.push(`${key}: ${data[key]}`)
                }
            }
        } else if (failure.reason.data) {
            acc.push(String(failure.reason.data))
        } else if (failure.message) {
            acc.push(failure.message)
        }
        return acc
    }

    let lines = result.failures.reduce(failureLines, [])
    return result.messages.concat(lines).join('\n')
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
            return output.line;
        case 'compile-errors':
            return buildCompileErrorsMessage(output.errors)
    }
}

function buildCompileErrorsMessage(errors: Error[]): string {
    return errors.map(buildCompileErrorMessage)
        .join('\n\n')
}

function buildCompileErrorMessage(error: Error): string {
    return [
        `${error.path}`
    ].concat(
        error.problems.map(buildProblemMessage)
    )
        .join('\n\n')
}

function buildProblemMessage(problem: Problem): string {
    return [
        `${buildRegion(problem.region)} ${problem.title}\n`
    ].concat(
        problem.message.map(getMessageString)
    )
        .join('')
}

function buildRegion(region: Region): string {
    return `${buildPosition(region.start)}-${buildPosition(region.end)}`
}

function buildPosition(pos: Position): string {
    return `${pos.line}:${pos.column}`
}

function getMessageString(message: MessagePart): string {
    return typeof message === 'string'
        ? message
        : message["string"]
}