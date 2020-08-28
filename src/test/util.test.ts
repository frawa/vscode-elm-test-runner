//import { expect } from 'chai';

import { TestSuiteInfo } from "vscode-test-adapter-api"
import { walk } from "../util"
import { expect } from "chai";

describe('util', () => {

    describe('walk suite', () => {

        it("no children", () => {
            const suite: TestSuiteInfo = {
                type: 'suite',
                'id': 'a',
                "label": 'a',
                children: []
            }
            const walked = Array.from(walk(suite))
            expect(walked).to.eql([suite])
        });

        it("depth first", () => {
            const suite: TestSuiteInfo = {
                type: 'suite',
                'id': 'a',
                "label": 'a',
                children: [{
                    type: 'suite',
                    'id': 'a/b',
                    "label": 'b',
                    children: [{
                        type: 'test',
                        'id': 'a/b/c',
                        "label": 'c',
                    }, {
                        type: 'test',
                        'id': 'a/b/d',
                        "label": 'd',
                    }]
                }, {
                    type: 'suite',
                    'id': 'a/e',
                    "label": 'e',
                    children: []
                }]
            }
            const walked = Array.from(walk(suite))
            expect(walked.map(n => n.label)).to.eql(['a', 'b', 'c', 'd', 'e'])
        });
    })

    describe.skip('parse for lines, by files', () => {
    })

    describe.skip('find files for tests', () => {
    })
})