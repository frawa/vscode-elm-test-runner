import * as json from 'jsonc-parser'

export function parseTestResult(line: string): (Result | string) {
    var errors: json.ParseError[] = []
    var result: Result = json.parse(line, errors)
    var nojson = errors.find(e => e.error === json.ParseErrorCode.InvalidSymbol)
    if (errors.length > 0 && nojson) {
        return line
    }
    return result
}

export interface Result {
    event: string
    status: string
    labels: string[]
    failures: Failure[]
    messages: string[]
    duration: string,
    testCount?: number
}

export interface Failure {
    message: string
    reason: {
        data: any
    }
}

export function buildMessage(result: Result): string {
    let failureLines = (acc: string[], failure: Failure) => {
        if (typeof failure === 'string') {
            acc.push(failure)
        } else {
            if (failure.reason && failure.reason.data && (typeof failure.reason.data !== 'string')) {
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
            } else if (failure.message) {
                acc.push(failure.message)
            }
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
