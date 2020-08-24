import { expect } from 'chai';

import { RunState } from '../runState'

describe('Run State Tests', () => {

    var runState: RunState = new RunState(true)

    beforeEach(() => {
        runState = new RunState(true)
    })

    it('is enabled', () => {
        expect(runState.enabled).to.eq(true)
    })

    it('can disable', () => {
        runState.disable()
        expect(runState.enabled).to.eq(false)
    })

    it('can enable', () => {
        runState.disable()
        expect(runState.enabled).to.eq(false)
        runState.enable()
        expect(runState.enabled).to.eq(true)
    })

    it('is not running', () => {
        expect(runState.running).to.eq(false)
    })

    it('run on folder', () => {
        var runningPath: string = ""
        let runner = (path: string) => runningPath = path

        runState.runner = runner

        expect(runState.running).to.eq(false)
        runState.runFolder("myname", "my/path")
        expect(runState.running).to.eq(true)
        expect(runningPath).to.eq("my/path")
        runState.runCompleted(runningPath)
        expect(runState.running).to.eq(false)
    })

    it('do not run when disabled', () => {
        var runningPath: string = "nothing"
        let runner = (path: string) => runningPath = path

        runState.runner = runner

        runState.disable()
        expect(runState.enabled).to.eq(false)
        expect(runState.running).to.eq(false)

        runState.runFolder("myname", "my/path")
        expect(runState.running).to.eq(false)
        expect(runningPath).to.eq("nothing")
    })

    it('get one result tree', () => {
        runState.runFolder("myname", "my/path")
        let tree = runState.getResultTree("my/path")

        expect(tree).to.not.eq(undefined)
        expect(tree.root.name).to.eq("myname")
    })

    it('get all results root, unique', () => {
        runState.runFolder("myname", "my/path")
        runState.runCompleted("my/path")
        let root = runState.getAllResults()

        expect(root).to.not.eq(undefined)
        expect(root.name).to.eq("Multi")
        expect(root.subs).to.have.length(1)
        expect(root.subs[0].name).to.eq("myname")
        expect(root.subs[0].subs).to.have.length(0)
    })

    it('get all results root, multiple', () => {
        runState.runFolder("myname", "my/path")
        runState.runCompleted("my/path")
        runState.runFolder("myname2", "my/path2")
        runState.runCompleted("my/path2")

        let root = runState.getAllResults()

        expect(root).to.not.eq(undefined)
        expect(root.name).to.eq("Multi")
        expect(root.subs).to.have.length(2)
        expect(root.subs[0].name).to.eq("myname")
        expect(root.subs[1].name).to.eq("myname2")
    })

    it('only one active run', () => {
        var countRuns = 0
        let runner = () => {
            countRuns++
        }

        runState.runner = runner

        runState.runFolder("myname", "my/path")
        expect(runState.running).to.eq(true)
        expect(countRuns).to.eq(1)

        runState.runFolder("myname", "my/path")
        expect(runState.running).to.eq(true)
        expect(countRuns).to.eq(1)

        runState.runCompleted("my/path")
        expect(runState.running).to.eq(true)
        expect(countRuns).to.eq(2)

        runState.runCompleted("my/path")
        expect(runState.running).to.eq(false)
    })

    it('push/pop', () => {
        runState.push("myname", "my/path")
        let next = runState.pop()
        expect(next).not.to.eq(undefined)
        expect(next).to.eql(["myname", "my/path"])
    })

    it('push/pop, remove duplicates', () => {
        runState.push("myname", "my/path")
        runState.push("myname2", "my/path2")
        runState.push("myname", "my/path")

        let next = runState.pop()
        expect(next).not.to.eq(undefined)
        expect(next).to.eql(["myname", "my/path"])

        let next2 = runState.pop()
        expect(next2).not.to.eq(undefined)
        expect(next2).to.eql(["myname2", "my/path2"])

        let next3 = runState.pop()
        expect(next3).to.eq(undefined)
    })

    it('disable clears', () => {
        runState.runFolder("myname", "my/path")
        runState.runFolder("myname", "my/path")
        runState.runCompleted("my/path")
        expect(runState.getAllResults().subs).to.be.of.length(1)

        runState.disable()
        expect(runState.getAllResults().subs).to.be.of.length(0)
    })

    it('remove folder', () => {
        runState.runFolder("myname", "my/path")
        runState.runCompleted("my/path")
        runState.runFolder("myname2", "my/path2")
        runState.runCompleted("my/path2")

        let root = runState.getAllResults()

        expect(root.subs).to.have.length(2)
        expect(root.subs[0].name).to.eq("myname")
        expect(root.subs[1].name).to.eq("myname2")

        runState.removeFolder("my/path2")

        let root2 = runState.getAllResults()
        expect(root2.subs).to.have.length(1)
        expect(root2.subs[0].name).to.eq("myname")
    })

})