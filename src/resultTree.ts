
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
    duration: string,
    testCount?: number
}

export function parseTestResult(line: string): (Result | string) {
    var errors: json.ParseError[] = []
    var result: Result = json.parse(line, errors)
    if (errors.length > 0) {
        return line
    }
    return result
}

type ProgressListener = (current: number, testCount?: number) => void

export class ResultTree {
    private _tests: Result[] = []
    private _root: Node = new Node('')
    private readonly _running: string = "Running ..."
    private _pendingMessages: string[] = []
    private _progress: ProgressListener = () => { }
    private count: number = 0

    constructor(public readonly path?: string) {
        if (path) {
            this.running = true
        }
    }

    set progress(progress: ProgressListener) {
        this._progress = progress
    }

    isRunning(): boolean {
        return this._root.subs.length > 0
            && this._root.subs[0].name === this._running
    }

    private set running(running: boolean) {
        if (this.isRunning() !== running) {
            if (running) {
                this._tests = []
                this._root.subs = [new Node(this._running)]
            } else {
                this._root.subs.shift()
                let dangeling = this.popMessages()
                if (dangeling.length > 0) {
                    this._root.subs.push(new Node('Messages', dangeling))
                }
            }
        }
    }

    parse(lines: string[]): void {
        lines
            .map(parseTestResult)
            .forEach(result => {
                if (typeof result === 'string') {
                    this.pushMessage(result)
                } else {
                    this.accept(result)
                }
            })
    }

    private pushMessage(message: string): void {
        if (!message) {
            return;
        }
        this._pendingMessages.push(message)
    }

    private popMessages(): string[] {
        let result = this._pendingMessages
        this._pendingMessages = []
        return result
    }

    accept(result: Result): void {
        if (!result) {
            return;
        }
        if (result.event === 'testCompleted') {
            this._root.addResult(result, this.popMessages())
            this._tests.push(result)
            this.count++
            this._progress(this.count)
        } else if (result.event === 'runStart') {
            this.running = true
            this.count = 0
            this._progress(0, result.testCount)
        } else if (result.event === 'runComplete') {
            this.running = false
            this._progress(-1)
        }
    }

    public get tests(): Result[] {
        return this._tests
    }

    public set errors(errors: string[]) {
        errors.forEach(err => this.pushMessage("! " + err))
    }

    public get root(): Node {
        return this._root
    }
}

export class Node {
    subs: Node[] = []
    result?: Result
    private _messages: string[] = []
    private parent?: Node

    constructor(public name: string, messages?: string[]) {
        if (messages) {
            this.addMessages(messages)
        }
    }

    addResult(result: Result, messages: string[]): void {
        let labels: string[] = []
        labels = labels.concat(result.labels)
        this.add(labels, result).addMessages(messages)
    }

    addChild(child: Node): void {
        this.subs.push(child)
        child.parent = this
    }

    private get path(): string[] {
        if (this.parent) {
            return this.parent.path.concat(this.name)
        }
        return [this.name]
    }

    private addMessages(messages: string[]): void {
        this._messages = this._messages.concat(messages)
    }

    get messages(): string[] {
        let messages = this._messages.length > 0
            ? ['--- ' + this.path.join(' / ')].concat(this._messages)
            : this._messages
        return this.subs.reduce((acc, sub) => {
            return acc.concat(sub.messages)
        }, messages)
    }

    private add(labels: string[], result: Result): Node {
        if (labels.length === 0) {
            if (result.status === 'todo') {
                let todoLabel = result.failures[0].toString()
                let todo = new Node(todoLabel, ['todo'])
                todo.addFailures(result.failures)
                todo.result = result
                todo.result.labels = [...result.labels, todoLabel]
                this.addChild(todo)
            } else {
                this.addFailures(result.failures)
                this.result = result
            }
            return this
        }
        let name = labels.shift()

        let found = this.subs.find(sub => sub.name === name)
        if (found) {
            return found.add(labels, result)
        }

        var newNode: Node = new Node(name || '')
        this.addChild(newNode)
        return newNode.add(labels, result)
    }

    private addFailures(failures: Failure[]) {
        let failureLines = (acc: string[], failure: Failure) => {
            if (typeof failure === 'string') {
                acc.push(failure)
            }
            if (failure.message) {
                acc.push(failure.message)
            }
            if (failure.reason && failure.reason.data && (typeof failure.reason.data !== 'string')) {
                let data = failure.reason.data
                for (let key in data) {
                    acc.push(`${key}: ${data[key]}`)
                }
            }
            return acc
        }

        let lines = failures.reduce(failureLines, [])
        this.addMessages(lines)
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
        let modules = this._messages.map(message => {
            let firstFileInError = new RegExp("^.*?/tests/(.*?)\.elm")
            let matches = firstFileInError.exec(message)
            if (matches) {
                return matches[1].replace('/', '.')
            }
            return undefined
        })
        if (modules.length > 0) {
            return modules[0]
        } else {
            let moduleNode = Node.getParentUnderRoot(this)
            if (moduleNode) {
                return moduleNode.name
            }
        }
        return undefined
    }

    private static getParentUnderRoot(node: Node): Node | undefined {
        if (!node || !node.parent) {
            return undefined;
        }
        return !node.parent.parent
            ? node
            : this.getParentUnderRoot(node.parent)
    }

    public get testModuleAndName(): [string, string] | undefined {
        if (this.result) {
            let labels = this.result.labels
            return [labels[0], labels[labels.length - 1]]
        }

        if (this.parent) {
            let fromParent = this.parent.testModuleAndName
            if (fromParent) {
                let module = fromParent[0]
                return [module, this.name]
            }
        }

        let module = this.testModule
        let name = this.name.length > 0 ? this.name : undefined
        return module && name ? [module, name] : undefined
    }

    public get canDiff(): boolean {
        return this.diff !== undefined
    }

    public get diff(): [string, string] | undefined {
        if (this.result) {
            if (this.result.failures.length > 0) {
                let failure = this.result.failures[0]
                if (failure.reason
                    && failure.reason.data
                    && (typeof failure.reason.data !== 'string')) {
                    let data = failure.reason.data
                    return [evalStringLiteral(data.expected), evalStringLiteral(data.actual)]
                }
            }
        }
        return undefined
    }

    public get expanded(): boolean | undefined {
        if (this.subs.length === 0) {
            return undefined
        }
        return !this.green
    }
}

function evalStringLiteral(value: string): string {
    if (value && value.startsWith('"')) {
        return eval(value).toString()
    }
    return value
}
