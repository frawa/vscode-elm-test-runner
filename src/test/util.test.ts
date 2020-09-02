//import { expect } from 'chai';

import { TestSuiteInfo } from "vscode-test-adapter-api"
import { walk, getTestInfosByFile, findOffsetForTest, getFilesAndAllTestIds, ElmBinaries, buildElmTestArgs, buildElmTestArgsWithReport } from "../util"
import { expect } from "chai";

describe('util', () => {
    const suiteWithoutChildren: TestSuiteInfo = {
        type: 'suite',
        'id': 'a',
        "label": 'a',
        children: []
    }

    const suiteWithFiles: TestSuiteInfo = {
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
            const testInfosByFiles = getTestInfosByFile(suiteWithFiles)
            expect(Array.from(testInfosByFiles.keys())).to.eql(['file2', 'file1'])
            expect(testInfosByFiles.get('file1')?.map(n => n.label)).to.eql(['c'])
            expect(testInfosByFiles.get('file2')?.map(n => n.label)).to.eql(['b', 'd'])
        })
    })

    describe('find lines for tests', () => {
        it("no match", () => {
            const text = `
            some thing else
            `;
            const offset = findOffsetForTest(["first"], text, getIndent(text))
            expect(offset).to.be.undefined
        })

        it("match path", () => {
            const text = `
            suite1: Test
            describe "first"
                test "nested"
            suite1: Test
            describe "second"
            `;
            const offset = findOffsetForTest(["first", "nested"], text, getIndent(text))
            expect(text.substr(offset! - 5, 13)).to.be.eq('test "nested"')
        })

        it("match full path", () => {
            const text = `
            suite1: Test
            describe "first"
                test "nested"
            suite1: Test
            describe "second"
                describe "first"
                    fuzz "nested"
            `;
            const offset = findOffsetForTest(["second", "first", "nested"], text, getIndent(text))
            expect(text.substr(offset! - 5, 13)).to.be.eq('fuzz "nested"')
        })

        it("do not match 'wrong' path", () => {
            const text = `
            suite1: Test
            describe "second"
                describe "first"
                    test "nested"
            suite2: Test
            describe "first"
                describe "nested"
           `;
            const offset = findOffsetForTest(["first", "nested"], text, getIndent(text))
            expect(text.substr(offset! - 9, 17)).to.be.eq('describe "nested"')
        })

        function getIndent(text: string): ((offset: number) => number) {
            return (offset: number) => {
                const lastLineOffset = text.lastIndexOf('\n', offset)
                return offset - lastLineOffset;
            }
        }

        it("with stuff in between", () => {
            const text = `
            suite1: Test
            describe "second"
                describe "first"
                    test "nested"

            suite2: Test
            suite2 =
            describe "first"
                [ fuzz (stuff) "nested"
                ]
           `;
            const offset = findOffsetForTest(["first", "nested"], text, getIndent(text))
            expect(text.substr(offset! - 13, 21)).to.be.eq('fuzz (stuff) "nested"')
        })
    })

    describe('find files for tests', () => {

        it("empty", () => {
            const ids = ['x']
            const [files, allIds] = getFilesAndAllTestIds(ids, suiteWithoutChildren)
            expect(files).to.be.empty
            expect(allIds).to.be.empty
        })

        it("two tests", () => {
            const ids = ['a/b']
            const [files, allIds] = getFilesAndAllTestIds(ids, suiteWithFiles)
            expect(files).to.eql(['file2'])
            expect(allIds).to.eql(['a/b', 'a/d'])
        })
    })

    describe('get elm-test args', () => {
        it("without anything", () => {
            const binaries: ElmBinaries = {
            }
            const args = buildElmTestArgs(binaries);
            expect(args).to.eql(['elm-test'])
        })

        it("with local elm-test", () => {
            const binaries: ElmBinaries = {
                elmTest: "local/elm-test"
            }
            const args = buildElmTestArgs(binaries);
            expect(args).to.eql(['local/elm-test'])
        })

        it("with local elm compiler (0.19)", () => {
            const binaries: ElmBinaries = {
                elmTest: "local/elm-test",
                elm: "local/elm"
            }
            const args = buildElmTestArgs(binaries);
            expect(args).to.eql([
                'local/elm-test',
                '--compiler',
                'local/elm'
            ])
        })

        it("with local elm-make compiler (0.18)", () => {
            const binaries: ElmBinaries = {
                elmTest: "local/elm-test",
                elmMake: "local/elm-make"
            }
            const args = buildElmTestArgs(binaries);
            expect(args).to.eql([
                'local/elm-test',
                '--compiler',
                'local/elm-make'
            ])
        })

        it("with files", () => {
            const binaries: ElmBinaries = {
                elmTest: "local/elm-test",
                elm: "local/elm"
            }
            const files = ['file1', 'file2']
            const args = buildElmTestArgs(binaries, files);
            expect(args).to.eql([
                'local/elm-test',
                '--compiler',
                'local/elm',
                'file1',
                'file2'
            ])
        })

        it("with report", () => {
            const args: string[] = [
                'path/elm-test',
                'file'
            ]
            const withReport = buildElmTestArgsWithReport(args);
            expect(withReport).to.eql([
                'path/elm-test',
                'file',
                '--report',
                'json'
            ])
        })
    });
})