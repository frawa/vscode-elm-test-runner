import { expect } from 'chai';

import { parseTestResult, ResultTree, Result, Node } from '../resultTree'

describe('Result Tree Tests', () => {

    describe('parse results', () => {

        let emptyResult = {
            event: ""
            , status: ""
            , labels: []
            , failures: []
            , duration: ""
        }

        it('one line pass', () => {
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

        it('one line todo', () => {
            let line = '{"event":"testCompleted","status":"todo","labels":["suite"],"failures":["todo comment"],"duration":"1"}'
            let result = parseTestResult(line)

            if (typeof result !== 'string') {
                expect(result.event).to.eql('testCompleted')
                expect(result.status).to.eql('todo')
                expect(result.labels).to.eql(['suite'])
                expect(result.failures).to.eql(['todo comment'])
                expect(result.duration).to.eql('1')
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
            results.parse([message, line])
            expect(results.tests).to.be.of.length(1)
            // expect(results.root).to.eql({})
            expect(results.root.subs).to.be.of.length(1)
            expect(results.root.subs[0].subs[0].subs[0].messages).to.eql(['---  / suite / nested / test', message])
        })

        it('model with todo', () => {
            let results = new ResultTree

            let line = '{"event":"testCompleted","status":"todo","labels":["suite"],"failures":["todo comment"],"duration":"1"}'
            results.parse([line])
            expect(results.tests).to.be.of.length(1)
            // expect(results.root).to.eql({})
            expect(results.root.subs).to.be.of.length(1)
            expect(results.root.subs[0].name).to.eql('suite')
            expect(results.root.subs[0].result).to.be.undefined
            expect(results.root.subs[0].subs).to.of.length(1)
            expect(results.root.subs[0].subs[0].name).to.eql('todo comment')
            expect(results.root.subs[0].subs[0].result).not.to.be.undefined
            let result = results.root.subs[0].subs[0].result
            if (result) {
                expect(result.labels).to.eql(['suite', 'todo comment'])
                expect(result.status).to.eql('todo')
            }
            expect(results.root.subs[0].subs[0].messages).to.eql([
                "---  / suite / todo comment",
                "todo",
                "todo comment"
            ])
        })

        it('with errors', () => {
            let errors = ['an error', 'another error']
            let tree = new ResultTree
            tree.errors = errors
            tree.accept({ ...emptyResult, event: 'testCompleted' })
            expect(tree.root.subs).to.be.of.length(0)
            expect(tree.root.messages).to.eql(['--- '].concat(errors.map(m => '! ' + m)))
        })

        it('with more errors', () => {
            let errors = ['an error', 'another error']
            let tree = new ResultTree
            tree.errors = errors
            let moreErrors = ['yet another error', 'give up']
            tree.errors = moreErrors
            tree.accept({ ...emptyResult, event: 'testCompleted' })
            expect(tree.root.messages).to.eql(
                ["--- "
                    , "! an error"
                    , "! another error"
                    , "! yet another error"
                    , "! give up"])
        })

        it('model runStart', () => {
            let results = new ResultTree

            let line = '{"event":"testCompleted","status":"pass","labels":["suite","nested","test"],"failures":[],"duration":"13"}'
            results.parse([line])
            expect(results.tests).to.be.of.length(1)
            expect(results.root.subs).to.be.of.length(1)
            expect(results.root.subs[0].messages).to.eql([])

            let line2 = '{"event":"runStart","testCount":"24","fuzzRuns":"100","paths":[],"initialSeed":"1646362476"}'
            results.parse([line2])
            expect(results.tests).to.be.of.length(0)
            expect(results.root.subs).to.be.of.length(1)
            expect(results.root.subs[0].name).to.eql('Running ...')
            expect(results.root.subs[0].messages).to.eql([])
        })


    })

    describe('test nodes', () => {
        let root: Node = new Node('')

        beforeEach(() => {
            root = new Node('')
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
            root.addResult(result, [])
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
            root.addResult(result, [])
            root.addResult(result2, [])
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
            root.addResult(result, [])
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
            root.addResult(result, [])
            root.addResult(result2, [])
            root.addResult(result3, [])
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
            root.addResult(result, [])
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
            root.addResult(result, [])
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
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('suite')
            expect(root.subs[0].subs[0].name).to.eql('test')
        })

        it('test module file in message', () => {
            let node = new Node('', ['message with file blabla/tests/Module/File.elm'])
            let module = node.testModule
            expect(module).to.eql('Module.File')
        })

        it('can not diff', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('test')
            expect(root.subs[0].canDiff).to.be.false
        })

        it('can diff', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['test']
                , failures: [{
                    message: 'diffable failure',
                    reason: {
                        data: {
                            actual: 'actual',
                            expected: 'expected'
                        }
                    }
                }]
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('test')
            expect(root.subs[0].canDiff).to.true
            expect(root.subs[0].diff).to.eql([
                'expected',
                'actual'
            ])
        })

        it('diff sting value', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['test']
                , failures: [{
                    message: 'diffable failure',
                    reason: {
                        data: {
                            actual: '"actual\\nvalue"',
                            expected: '"expected"'
                        }
                    }
                }]
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('test')
            expect(root.subs[0].canDiff).to.true
            expect(root.subs[0].diff).to.eql([
                'expected',
                'actual\nvalue'
            ])
        })

        it('test coordinates', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['Module.suite', 'test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('Module.suite')
            expect(root.subs[0].subs[0].name).to.eql('test')

            let coords = root.subs[0].subs[0].testModuleAndName
            expect(coords).to.eql([
                'Module.suite',
                'test'
            ])
        })

        it('deep test coordinates', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['Module.suite', 'nested', 'test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('Module.suite')
            expect(root.subs[0].subs[0].name).to.eql('nested')
            expect(root.subs[0].subs[0].subs[0].name).to.eql('test')

            let coords = root.subs[0].subs[0].subs[0].testModuleAndName
            expect(coords).to.eql([
                'Module.suite',
                'test'
            ])
        })

        it('intermediate test coordinates', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['Module.suite', 'nested', 'test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('Module.suite')
            expect(root.subs[0].subs[0].name).to.eql('nested')

            expect(root.subs[0].subs[0].testModuleAndName).to.eql([
                'Module.suite',
                'nested'
            ])
            expect(root.subs[0].testModuleAndName).to.eql([
                'Module.suite',
                'Module.suite'
            ])
        })

        it('expanded red parent', () => {
            let result: Result = {
                event: ''
                , status: 'fail'
                , labels: ['suite', 'test']
                , failures: [{
                    message: 'diffable failure',
                    reason: {
                        data: 'failure message'
                    }
                }]
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('suite')
            expect(root.subs[0].green).to.eql(false)
            expect(root.subs[0].expanded).to.eql(true)
            expect(root.subs[0].subs[0].name).to.eql('test')
            expect(root.subs[0].subs[0].green).to.eql(false)
            expect(root.subs[0].subs[0].expanded).to.eql(undefined)
        })

        it('flat red leaf', () => {
            let result: Result = {
                event: ''
                , status: 'fail'
                , labels: ['suite', 'test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('suite')
            expect(root.subs[0].green).to.eql(false)
            expect(root.subs[0].expanded).to.eql(true)
            expect(root.subs[0].subs[0].name).to.eql('test')
            expect(root.subs[0].subs[0].green).to.eql(false)
            expect(root.subs[0].subs[0].expanded).to.eql(undefined)
        })

        it('collapsed green leaf', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('test')
            expect(root.subs[0].green).to.eql(true)
            // expect(root.subs[0]).to.eql({})
            expect(root.subs[0].expanded).to.eql(undefined)
        })

        it('expanded green parent', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['suite', 'test']
                , failures: []
                , duration: '0'
            }
            root.addResult(result, [])
            expect(root.subs).to.be.length(1)
            expect(root.subs[0].name).to.eql('suite')
            expect(root.subs[0].green).to.eql(true)
            expect(root.subs[0].expanded).to.eql(false)
        })

        it('flat root', () => {
            let flat = new Node('flat')
            expect(flat.expanded).to.eql(undefined)
        })

        it('aggregate messages', () => {
            let result: Result = {
                event: ''
                , status: 'pass'
                , labels: ['suite', 'test']
                , failures: []
                , duration: '0'
            }
            let result2: Result = {
                event: ''
                , status: 'pass'
                , labels: ['suite', 'test2']
                , failures: []
                , duration: '0'
            }
            root.addResult(result, ['message 1'])
            root.addResult(result2, ['message 2'])
            expect(root.subs[0].subs[0].messages).to.eql(["---  / suite / test", 'message 1'])
            expect(root.subs[0].subs[1].messages).to.eql(["---  / suite / test2", 'message 2'])
            expect(root.subs[0].messages).to.eql(["---  / suite / test", 'message 1', "---  / suite / test2", 'message 2'])
        })
    })
})