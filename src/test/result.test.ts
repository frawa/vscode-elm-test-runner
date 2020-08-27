import { expect } from 'chai';

import { parseTestResult } from '../result'

describe('Result', () => {

    describe('parse results', () => {

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

        it('a message', () => {
            let line = 'a message'
            let result = parseTestResult(line)
            expect(result).to.eql(line)
        })

    })

    describe.skip('build message', () => {
    });

})