//import { expect } from 'chai';

import { TestSuiteInfo } from "vscode-test-adapter-api"
import { walk, getTestInfosByFile } from "../util"
import { expect } from "chai";

describe('util', () => {
    const suiteWithoutChildren: TestSuiteInfo = {
        type: 'suite',
        'id': 'a',
        "label": 'a',
        children: []
    }
    describe('walk suite', () => {

        it("no children", () => {
            const walked = Array.from(walk(suiteWithoutChildren))
            expect(walked).to.eql([suiteWithoutChildren])
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

    describe('get test infos by file', () => {
        it("no children", () => {
            const testInfosByFiles = getTestInfosByFile(suiteWithoutChildren)
            expect(testInfosByFiles).to.be.empty
        })

        it("no files", () => {
            const suite: TestSuiteInfo = {
                type: 'suite',
                'id': 'a',
                "label": 'a',
                children: [{
                    type: 'test',
                    'id': 'a/b/c',
                    "label": 'c',
                }]
            }
            const testInfosByFiles = getTestInfosByFile(suite)
            expect(testInfosByFiles).to.be.empty
        })

        it("two files", () => {
            const suite: TestSuiteInfo = {
                type: 'suite',
                'id': 'a',
                "label": 'a',
                "file": "file0",
                children: [{
                    type: 'test',
                    'id': 'a/b',
                    "label": 'b',
                    "file": "file2"
                }, {
                    type: 'test',
                    'id': 'a/c',
                    "label": 'c',
                    "file": "file1"
                }, {
                    type: 'test',
                    'id': 'a/d',
                    "label": 'd',
                    "file": "file2"
                }]
            }
            const testInfosByFiles = getTestInfosByFile(suite)
            expect(Array.from(testInfosByFiles.keys())).to.eql(['file2', 'file1'])
            expect(testInfosByFiles.get('file1')?.map(n => n.label)).to.eql(['c'])
            expect(testInfosByFiles.get('file2')?.map(n => n.label)).to.eql(['b', 'd'])
        })
    })

    describe.skip('find files for tests', () => {
    })
})