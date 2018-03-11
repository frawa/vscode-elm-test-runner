import { expect } from 'chai';

import { parseTestResult, ResultTree, Result, Node } from '../resultTree'

describe('Result Tree Tests', () => {

    describe('parse results', () => {

        it('one line', () => {
            let line = '{"event":"testCompleted","status":"pass","labels":["suite","nested","test"],"failures":[],"duration":"13"}'
            let result = parseTestResult(line)

            if (typeof result !== 'string') {
                expect(result.event).to.eql('testCompleted')
                expect(result.status).to.eql('pass')
                expect(result.labels).to.eql(['suite', 'nested', 'test'])
                expect(result.failures).to.eql([])
                expect(result.duration).to.eql('13')
            } else {
                expect.fail("unexpected: " + result)
            }
        })

        it('model', () => {
            let results = new ResultTree

            let line = '{"event":"testCompleted","status":"pass","labels":["suite","nested","test"],"failures":[],"duration":"13"}'
            results.parse([line])
            expect(results.tests).to.be.of.length(1)
            // expect(results.root).to.eql({})
            expect(results.root.message).to.be.undefined
            expect(results.root.subs).to.be.of.length(1)
            expect(results.root.subs[0].name).to.eql('suite')
        })

        it('a message', () => {
            let line = 'a message'
            let result = parseTestResult(line)
            expect(result).to.eql(line)
        })

        it('model with message', () => {
            let results = new ResultTree

            let line = '{"event":"testCompleted","status":"pass","labels":["suite","nested","test"],"failures":[],"duration":"13"}'
            let message = 'a message'
            results.parse([line, message])
            expect(results.tests).to.be.of.length(1)
            // expect(results.root).to.eql({})
            expect(results.root.subs).to.be.of.length(2)
            expect(results.root.subs[1].message).to.eql(message)
        })

        it('with errors', () => {
            let errors = ['an error', 'another error']
            let tree = new ResultTree
            tree.errors = errors
            expect(tree.root.subs).to.be.of.length(2)
            expect(tree.root.subs[0].message).to.eql(errors[0])
            expect(tree.root.subs[1].message).to.eql(errors[1])
        })

        it('with more errors', () => {
            let errors = ['an error', 'another error']
            let tree = new ResultTree
            tree.errors = errors
            let moreErrors = ['yet another error', 'give up']
            tree.errors = moreErrors
            expect(tree.root.subs).to.be.of.length(4)
            expect(tree.root.subs[0].message).to.eql(errors[0])
            expect(tree.root.subs[1].message).to.eql(errors[1])
            expect(tree.root.subs[2].message).to.eql(moreErrors[0])
            expect(tree.root.subs[3].message).to.eql(moreErrors[1])
        })
    })

    describe('test nodes', () => {
        let root: Node = new Node

        beforeEach(() => {
            root = new Node
        })

        it('root', () => {
            expect(root.name).to.eql('')
        })

        it('add one', () => {
            let result: Result = {
                event: ''
                , status: ''
                , labels: ['suite']
                , failures: []
                , duration: '0'
            }
            root.addResult(result)
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('suite')
            expect(root.subs[0].result).to.eql(result)
        })

        it('add two', () => {
            let result: Result = {
                event: ''
                , status: ''
                , labels: ['test']
                , failures: []
                , duration: '0'
            }
            let result2: Result = {
                event: ''
                , status: ''
                , labels: ['test2']
                , failures: []
                , duration: '0'
            }
            root.addResult(result)
            root.addResult(result2)
            expect(root.subs).to.be.length(2)
            // expect(root.subs).to.eql([])
            expect(root.subs[0].name).to.eql('test')
            expect(root.subs[0].result).to.eql(result)
            expect(root.subs[1].name).to.eql('test2')
            expect(root.subs[1].result).to.eql(result2)
        })

        it('add deep', () => {
            let result: Result = {
                event: ''
                , status: ''
                , labels: ['suite', 'test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result)
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('suite')
            expect(root.subs[0].subs[0].name).to.eql('test')
            expect(root.subs[0].subs[0].result).to.equal(result)
        })

        it('add deep more', () => {
            let result: Result = {
                event: ''
                , status: ''
                , labels: ['suite', 'test']
                , failures: []
                , duration: '0'
            }
            let result2: Result = {
                event: ''
                , status: ''
                , labels: ['suite2', 'test2']
                , failures: []
                , duration: '0'
            }
            let result3: Result = {
                event: ''
                , status: ''
                , labels: ['suite', 'test3']
                , failures: []
                , duration: '0'
            }
            root.addResult(result)
            root.addResult(result2)
            root.addResult(result3)
            expect(root.subs).to.be.length(2)
            expect(root.subs[0].name).to.eql('suite')
            expect(root.subs[0].subs[0].name).to.eql('test')
            expect(root.subs[0].subs[0].result).to.equal(result)
            expect(root.subs[0].subs[1].name).to.eql('test3')
            expect(root.subs[0].subs[1].result).to.equal(result3)
            expect(root.subs[1].name).to.eql('suite2')
            expect(root.subs[1].subs[0].name).to.eql('test2')
            expect(root.subs[1].subs[0].result).to.equal(result2)
        })

        it('is green', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result)
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('test')
        })

        it('is not green', () => {
            let result: Result = {
                event: ''
                , status: 'fail'
                , labels: ['test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result)
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('test')
        })

        it('is green deep', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['suite', 'test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result)
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('suite')
            expect(root.subs[0].subs[0].name).to.eql('test')
        })

        it('test module file in message', () => {
            let node = new Node('message with file blabla/tests/Module/File.elm')
            let module = node.testModule
            expect(module).to.eql('Module.File')
        })
    })
})