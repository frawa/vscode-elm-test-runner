import { ResultTree, Node } from "./resultTree";

type RunnerFun = (path: string) => void

export class RunState {

    private _running: boolean = false
    private _runner: RunnerFun = () => { }
    private _trees: Map<string, ResultTree> = new Map()

    constructor(public enabled: boolean) {
    }

    public set runner(runner: RunnerFun) {
        this._runner = runner
    }

    public disable(): void {
        this.enabled = false
    }

    public get running(): boolean {
        return this._running
    }

    public runFolder(name: string, path: string): void {
        this._running = true
        let tree = this.getOrCreateResultTree(path)
        tree.root.name = name
        this._runner(path)
    }

    public runCompleted(path: string): void {
        this._running = false
    }

    private getOrCreateResultTree(path: string): ResultTree {
        var tree = this._trees.get(path)
        if (!tree) {
            tree = new ResultTree(true, path)
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

        if (roots.length == 1) {
            return roots[0]
        }
        let multi = new Node("")
        multi.subs = roots
        return multi
    }
}
