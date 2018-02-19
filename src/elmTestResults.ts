
import * as json from 'jsonc-parser'
// import * as R from 'ramda'

export interface Failure {
	message: string
}

export interface Result {
    event: string
    status: string,
    labels: string[],
    failures: Failure[],
    duration: string
}

export function parseTestResult(line: string): Result {
    return json.parse(line)
}

export class ResultTree {
    private _tests: Result[] = []
    private _root: Node = new Node

    parse(lines: string[]): void {
        lines
            .map(parseTestResult)
            //. filter undefined
            .forEach(result => this.accept(result))
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

    public get root(): Node {
        return this._root
    }
}

export class Node {
    name: string = ''
    subs: Node[] = []
    result?: Result

    addResult(result: Result): void {
        this.add(result.labels, result)
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
