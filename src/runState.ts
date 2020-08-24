import { ResultTree, Node } from "./resultTree";

type RunnerFun = (path: string) => void

export class RunState {

    private _running: boolean = false
    private _runner: RunnerFun = () => { }

    private _trees: Map<string, ResultTree> = new Map()
    private _stack: Array<[string, string]> = new Array()

    constructor(public enabled: boolean) {
    }

    public set runner(runner: RunnerFun) {
        this._runner = runner
    }

    public disable(): void {
        this.enabled = false
        this._trees = new Map()
        this._stack = new Array()
    }

    public enable(): void {
        this.enabled = true
    }

    public get running(): boolean {
        return this._running
    }

    public runFolder(name: string, path: string): void {
        if (!this.enabled) {
            return
        }

        if (this._running) {
            this.push(name, path)
            return
        }

        this._running = true
        let tree = this.getOrCreateResultTree(path)
        tree.root.name = name

        this._runner(path)
    }

    public runCompleted(path: string): void {
        this._running = false
        this.getOrCreateResultTree(path).complete()

        let next = this.pop()
        if (next) {
            let [name, path] = next
            console.info(`Catching up runs in ${name}.`)
            this.runFolder(name, path)
        }
    }

    private getOrCreateResultTree(path: string): ResultTree {
        var tree = this._trees.get(path)
        if (!tree) {
            tree = new ResultTree(true)
            this._trees.set(path, tree)
        }
        return tree
    }

    public getResultTree(path: string): ResultTree {
        return this.getOrCreateResultTree(path)
    }

    public getAllResults(): Node {
        let roots: Node[] = Array.from(this._trees.values())
            .map((tree) => tree.root)

        let multi = new Node("Multi")
        multi.subs = roots
        return multi
    }

    push(name: string, path: string): void {
        this._stack.push([name, path])
    }

    pop(): [string, string] | undefined {
        let next = this._stack.pop()
        if (!next) {
            return undefined
        }
        let path = next[1]
        this.deleteFromStack(path)
        return next
    }

    private deleteFromStack(path: string): void {
        this._stack = this._stack.filter(([_, p]) => p !== path)
    }

    removeFolder(path: string): void {
        this._trees.delete(path)
        this.deleteFromStack(path)
    }
}
