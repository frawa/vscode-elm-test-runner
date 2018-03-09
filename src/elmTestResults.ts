
import * as json from 'jsonc-parser'
// import { Uri } from 'vscode';
// import * as R from 'ramda'

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

export function parseTestResult(line: string): (Result|string) {
    var errors : json.ParseError[] = []
    var result:Result = json.parse(line,errors)
    if (errors.length>0) {
        return line
    }
    return result
}

export class ResultTree {
    private _tests: Result[] = []
    private _root: Node = new Node
    private _messages: string[] = []

    constructor(public readonly path?: string) {
    }

    parse(lines: string[]): void {
        lines
            .map(parseTestResult)
            //. filter undefined
            .forEach(result => {
                if (typeof result ==='string') {
                    this._messages.push(result)
                } else {
                    this.accept(result)
                }
            })
    }

    accept(result: Result): void {
        if (!result) {
            return;
        }
        this._tests.push(result)
        if (result.event === 'testCompleted') {
            this._root.addResult(result)
        }
    }

    public get tests(): Result[] {
        return this._tests
    }

    public get messages(): string[] {
        return this._messages
    }

    public set errors(errors: string[]) {
        Array.prototype.push.apply(this._messages,errors)
    }

    public get root(): Node {
        return this._root
    }
}

export class Node {
    name: string = ''
    subs: Node[] = []
    result?: Result

    addResult(result: Result): void {
        let labels: string[] = []
        labels = labels.concat(result.labels)
        this.add(labels, result)
    }

    private add(labels: string[], result: Result): void {
        if (labels.length == 0) {
            this.result = result
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

    public get green(): boolean {
        if (this.result) {
            return this.result.status === 'pass'
        }
        if (this.subs.length > 0) {
            return this.subs.every(sub => sub.green)
        }
        return false;
    }
}
