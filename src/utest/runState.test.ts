import { expect } from 'chai';

import { RunState } from '../runState'

describe('Run State Tests', () => {

    let runState = new RunState(true)

    it('is enabled', () => {
        expect(runState.enabled).to.be.true
    })

    it('can disable', () => {
        runState.disable()
        expect(runState.enabled).to.be.false
    })

    it('is not running', () => {
        expect(runState.running).to.be.false
    })

    it('run on folder', () => {
        var runningPath: string = ""
        let runner = (path: string) => runningPath = path

        runState.runner = runner

        expect(runState.running).to.be.false
        runState.runFolder("myname", "my/path")
        expect(runState.running).to.be.true
        expect(runningPath).to.eq("my/path")
        runState.runCompleted(runningPath)
        expect(runState.running).to.be.false
    })

    it('get one result tree', () => {
        runState.runFolder("myname", "my/path")
        let tree = runState.getResultTree("my/path")

        expect(tree).to.be.not.undefined
        expect(tree.root.name).to.eq("myname")
    })

    it('get all results root, unique', () => {
        runState.runFolder("myname", "my/path")
        let root = runState.getAllResults()

        expect(root).to.be.not.undefined
        expect(root.name).to.eq("myname")
    })

    it('get all results root, multiple', () => {
        runState.runFolder("myname", "my/path")
        runState.runFolder("myname2", "my/path2")
        let root = runState.getAllResults()

        expect(root).to.be.not.undefined
        expect(root.name).to.eq("")
        expect(root.subs).to.have.length(2)
        expect(root.subs[0].name).to.eq("myname")
        expect(root.subs[1].name).to.eq("myname2")
    })
})