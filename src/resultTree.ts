
import * as json from 'jsonc-parser'

export interface Failure {
    message: string
    reason: {
        data: any
    }
}

export interface Result {
    event: string
    status: string
    labels: string[]
    failures: Failure[]
    duration: string
}

export function parseTestResult(line: string): (Result | string) {
    var errors: json.ParseError[] = []
    var result: Result = json.parse(line, errors)
    if (errors.length > 0) {
        return line
    }
    return result
}

export class ResultTree {
    private _tests: Result[] = []
    private _root: Node = new Node
    private _running: Node = new Node('Running ...')

    constructor(public readonly path?: string) {
        this.running = true
    }

    private get running(): boolean {
        return this._root.subs.length == 1
            && this._root.subs[0] === this._running
    }

    private set running(running: boolean) {
        if (this.running !== running) {
            if (running) {
                this._tests = []
                this._root.subs = [this._running]
            } else {
                this._root.subs = []
            }
        }
    }

    parse(lines: string[]): void {
        lines
            .map(parseTestResult)
            .forEach(result => {
                if (typeof result === 'string') {
                    this.message(result)
                } else {
                    this.accept(result)
                }
            })
    }

    message(message: string): void {
        if (!message) {
            return;
        }
        this.running = false
        this._root.addChild(new Node(message))
    }

    accept(result: Result): void {
        if (!result) {
            return;
        }
        this._tests.push(result)
        if (result.event === 'testCompleted') {
            this.running = false
            this._root.addResult(result)
        } else if (result.event === 'runStart') {
            this.running = true
        }
    }

    public get tests(): Result[] {
        return this._tests
    }

    public set errors(errors: string[]) {
        errors.forEach(err => this.message(err))
    }

    public get root(): Node {
        return this._root
    }
}

export class Node {
    name: string = ''
    subs: Node[] = []
    result?: Result
    message?: string

    constructor(message?: string) {
        this.message = message
    }

    addResult(result: Result): void {
        let labels: string[] = []
        labels = labels.concat(result.labels)
        this.add(labels, result)
    }

    addChild(child: Node): void {
        this.subs.push(child)
    }

    private add(labels: string[], result: Result): void {
        if (labels.length === 0) {
            this.result = result
            this.addFailures(result.failures)
            return
        }
        let name = labels.shift()

        let found = false
        this.subs.forEach(sub => {
            if (sub.name === name) {
                sub.add(labels, result)
                found = true
            }
        })

        if (!found) {
            var newNode: Node = new Node
            newNode.name = name || ''
            this.subs.push(newNode)
            newNode.add(labels, result)
        }
    }

    private addFailures(failures: Failure[]) {
        let failureNodes = (acc: Node[], failure: Failure) => {
            if (failure.message) {
                acc.push(new Node(failure.message))
            }
            if (failure.reason && failure.reason.data && (typeof failure.reason.data !== 'string')) {
                let data = failure.reason.data
                for (let key in data) {
                    acc.push(new Node(`${key}: ${data[key]}`))
                }
            }
            return acc
        }

        failures
            .reduce(failureNodes, [])
            .forEach(node => this.addChild(node))
    }

    public get green(): boolean {
        if (this.result) {
            return this.result.status === 'pass'
        }
        if (this.subs.length > 0) {
            return this.subs.every(sub => sub.green)
        }
        return false
    }

    public get testModule(): string | undefined {
        if (this.message) {
            let firstFileInError = new RegExp("^.*?/tests/(.*?)\.elm")
            let matches = firstFileInError.exec(this.message)
            if (matches) {
                return matches[1].replace('/', '.')
            }
        }
        return undefined
    }

    public get testModuleAndName(): [string, string] | undefined {
        if (this.result) {
            let labels = this.result.labels
            return [labels[0], labels[labels.length - 1]]
        }
        return undefined
    }

    public get canDiff(): boolean {
        return this.diff !== undefined
    }

    public get diff(): [string, string] | undefined {
        if (this.result) {
            if (this.result.failures.length > 0) {
                let failure = this.result.failures[0]
                if (failure.reason.data
                    && (typeof failure.reason.data !== 'string')) {
                    let data = failure.reason.data
                    return [data.expected, data.actual]
                }
            }
        }
        return undefined
    }

    public get expanded(): boolean | undefined {
        if (this.message) {
            return undefined
        }
        let hasSubs = this.subs.length > 0
        if (this.green) {
            return hasSubs ? false : undefined
        }
        let isRedLeaf = this.result !== undefined
        return !isRedLeaf
    }
}
