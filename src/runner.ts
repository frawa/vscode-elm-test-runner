import * as vscode from 'vscode';
import { TestSuiteInfo, TestLoadFinishedEvent, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestDecoration } from "vscode-test-adapter-api";
import path = require("path");
import * as child_process from 'child_process'
import * as fs from 'fs';

import { Result, buildMessage, parseOutput, parseErrorOutput, buildErrorMessage } from "./result";
import { getTestInfosByFile, findOffsetForTest, getFilesAndAllTestIds, ElmBinaries, buildElmTestArgs, buildElmTestArgsWithReport, oneLine } from './util';
import { Log } from 'vscode-test-adapter-util';

export class ElmTestRunner {
    private loadedSuite?: TestSuiteInfo = undefined

    private resultById: Map<string, Result> = new Map<string, Result>();

    private resolve: (value: TestLoadFinishedEvent | PromiseLike<TestLoadFinishedEvent>) => void = () => { }
    private loadingSuite?: TestSuiteInfo = undefined
    private loadingErrorMessage?: string = undefined;
    private pendingMessages: string[] = [];

    constructor(
        private folder: vscode.WorkspaceFolder,
        private readonly log: Log) {
    }

    async fireLineEvents(suite: TestSuiteInfo, testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>): Promise<number> {
        const testInfosByFile = getTestInfosByFile(suite)
        return Promise.all(
            Array.from(testInfosByFile.entries())
                .map(([file, nodes]) =>
                    vscode.workspace.openTextDocument(file)
                        .then(doc => {
                            const text = doc.getText()
                            return nodes.map(node => {
                                const id = node.id
                                const result = this.resultById.get(id);
                                const names = result?.labels.slice(1)
                                return [findOffsetForTest(names!, text, (offset) => doc.positionAt(offset).character), id] as [number | undefined, string]
                            })
                                .filter(([offset, id]) => offset)
                                .map(([offset, id]) => [doc.positionAt(offset!).line, id] as [number, string])
                                .map(([line, id]) => ({
                                    type: 'test', test: id, line
                                } as TestEvent))
                        })
                        .then(events => events
                            .filter(v => v)
                            .map(event => {
                                testStatesEmitter.fire(event)
                                return true
                            })
                            .length
                        )
                )
        ).then(counts => counts.length > 0 ? counts.reduce((a, b) => a + b) : 0)
    }

    async fireEvents(node: TestSuiteInfo | TestInfo, testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>): Promise<boolean> {
        if (node.type === 'suite') {

            testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'running' });

            for (const child of node.children) {
                await this.fireEvents(child, testStatesEmitter);
            }

            testStatesEmitter.fire(<TestSuiteEvent>{ type: 'suite', suite: node.id, state: 'completed' });

        } else { // node.type === 'test'

            testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'running' });

            const result = this.resultById.get(node.id);
            const message = buildMessage(result!)
            switch (result?.status) {
                case 'pass': {
                    testStatesEmitter.fire(<TestEvent>{
                        type: 'test', test: node.id, state: 'passed', message,
                        description: `${result.duration}s`,
                    });
                    break;
                }
                case 'todo': {
                    testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'skipped', message });
                    break;
                }
                default:
                    if (node.file) {
                        await vscode.workspace.openTextDocument(node.file)
                            .then(doc => {
                                const text = doc.getText()
                                return result?.failures
                                    .filter(failure => failure.reason && failure.reason.data && failure.reason.data.actual)
                                    .map(failure => failure.reason.data)
                                    .map(data => {
                                        const result = this.resultById.get(node.id);
                                        const names = result?.labels.slice(1)
                                        const offset = findOffsetForTest(names!, text, (offset) => doc.positionAt(offset).character)
                                        const expectedIndex = text.indexOf(data.expected, offset)
                                        const expected = oneLine(data.expected)
                                        const actual = oneLine(data.actual)
                                        if (expectedIndex > -1) {
                                            const expectedLine = doc.positionAt(expectedIndex).line
                                            return {
                                                line: expectedLine,
                                                message: `${data.comparison} ${expected} ${actual}`
                                            } as TestDecoration
                                        } else if (offset) {
                                            const line = doc.positionAt(offset).line
                                            return {
                                                line: line,
                                                message: `${data.comparison} ${expected} ${actual}`
                                            } as TestDecoration
                                        }
                                    })
                            }).then(decorations => {
                                testStatesEmitter.fire(<TestEvent>{
                                    type: 'test',
                                    test: node.id,
                                    state: 'failed',
                                    message,
                                    decorations
                                });
                            })
                    }
                    break;
            }

        }
        return true;
    }

    async runAllTests(): Promise<TestLoadFinishedEvent> {
        this.loadedSuite = undefined
        return this.runSomeTests()
    }

    getFilesAndAllTestIds(tests: string[]): [string[], string[]] {
        return getFilesAndAllTestIds(tests, this.loadedSuite!)
    }

    async runSomeTests(files?: string[]): Promise<TestLoadFinishedEvent> {
        return new Promise<TestLoadFinishedEvent>((resolve, reject) => {
            this.resolve = resolve
            this.loadingSuite = {
                type: 'suite',
                id: 'root',
                label: 'root',
                children: []
            }
            this.loadingErrorMessage = undefined
            this.pendingMessages = []
            this.runElmTests(files)
        })
    }

    private runElmTests(files?: string[]) {
        const withOutput = vscode.workspace.getConfiguration('elmTestRunner').get('showElmTestOutput')
        let cwdPath = this.folder.uri.fsPath
        let args = this.elmTestArgs(cwdPath, files)
        if (withOutput) {
            this.runElmTestsWithOutput(cwdPath, args)
        } else {
            this.runElmTestWithReport(cwdPath, args)
        }
    }

    private runElmTestsWithOutput(cwdPath: string, args: string[]) {
        let kind: vscode.TaskDefinition = {
            type: 'elm-test'
        };

        this.log.info("Running Elm Tests as task", args)

        let task = new vscode.Task(
            kind,
            this.folder,
            'Run Elm Test',
            'Elm Test Run',
            new vscode.ShellExecution(
                args[0],
                args.slice(1), {
                cwd: cwdPath
            })
        )
        task.group = vscode.TaskGroup.Test
        task.presentationOptions = {
            clear: true,
            echo: true,
            focus: false,
            reveal: vscode.TaskRevealKind.Never,
            showReuseMessage: false
        }

        vscode.tasks
            .executeTask(task)
            .then(() => { })

        vscode.tasks.onDidEndTaskProcess((event) => {
            if (task === event.execution.task) {
                if (event.exitCode <= 2) {
                    this.runElmTestWithReport(cwdPath, args)
                } else {
                    console.error("elm-test failed", event.exitCode, args)
                    this.log.info("Running Elm Test task failed", event.exitCode, args)
                    this.resolve({
                        type: 'finished',
                        errorMessage: [
                            'elm-test failed.',
                            'Check for Elm errors,',
                            `find details in the "Task - ${task.name}" terminal.`
                        ].join('\n')
                    })
                }
            }
        })
    }

    private runElmTestWithReport(cwdPath: string, args: string[]) {
        this.log.info("Running Elm Tests", args)

        const argsWithReport = buildElmTestArgsWithReport(args)
        let elm = child_process.spawn(argsWithReport[0], argsWithReport.slice(1), {
            cwd: cwdPath,
            env: process.env
        })

        elm.stdout.on('data', (data: string) => {
            const lines = data.toString().split('\n')
            lines
                .forEach(line => {
                    this.parse([line])
                })
        })

        elm.stderr.on('data', (data: string) => {
            const lines = data.toString().split('\n')
            this.loadingErrorMessage = lines
                .map(parseErrorOutput)
                .map(buildErrorMessage)
                .join('\n')
        })

        elm.on('error', (err) => {
            const message = `Failed to run Elm Tests, is elm-test installed at ${args[0]}?`;
            this.log.error(message, err);
            this.resolve({
                type: 'finished',
                errorMessage: message
            })
        })

        elm.on('close', () => {
            if (this.loadingErrorMessage) {
                this.resolve({
                    type: 'finished',
                    errorMessage: this.loadingErrorMessage
                })
            } else {
                if (!this.loadedSuite) {
                    this.loadedSuite = this.loadingSuite
                }
                this.resolve({
                    type: 'finished',
                    suite: this.loadedSuite,
                })
            }
        })
    }

    private elmTestArgs(projectFolder: string, files?: string[]): string[] {
        return buildElmTestArgs(this.getElmBinaries(projectFolder), files);
    }

    private getElmBinaries(projectFolder: string): ElmBinaries {
        return {
            elmTest: this.findLocalNpmBinary('elm-test', projectFolder),
            elmMake: this.findLocalNpmBinary('elm-make', projectFolder),
            elm: this.findLocalNpmBinary('elm', projectFolder)
        }
    }

    private findLocalNpmBinary(binary: string, projectRoot: string): string | undefined {
        let binaryPath = path.join(projectRoot, 'node_modules', '.bin', binary)
        return fs.existsSync(binaryPath) ? binaryPath : undefined
    }

    private parse(lines: string[]): void {
        lines
            .map(parseOutput)
            .forEach(output => {
                switch (output.type) {
                    case 'message':
                        this.pushMessage(output.line)
                        break;
                    case 'result':
                        this.accept(output)
                }
            })
    }

    private pushMessage(message: string): void {
        if (!message) {
            return;
        }
        this.pendingMessages.push(message)
    }

    private popMessages(): string[] {
        let result = this.pendingMessages
        this.pendingMessages = []
        return result
    }

    private accept(result: Result): void {
        if (!result) {
            return
        }
        if (result.event === 'testCompleted') {
            result.messages = this.popMessages()
            const id = this.addResult(this.loadingSuite!, result)
            this.resultById.set(id, result)
            // this._tests.push(result)
        } else if (result.event === 'runStart') {
            // this.start();
        } else if (result.event === 'runComplete') {
            // this.complete()
        }
    }

    private addResult(suite: TestSuiteInfo, result: Result): string {
        let labels: string[] = []
        labels = labels.concat(result.labels)
        return this.addResult_(suite, labels, result)
    }

    private addResult_(suite: TestSuiteInfo, labels: string[], result: Result): string {
        if (labels.length === 1) {
            let testInfo: TestInfo = {
                type: 'test',
                id: suite.id + '/' + labels[0],
                label: labels[0],
                file: this.getFilePath(result)
            }
            if (result.status === 'todo') {
                testInfo = {
                    ...testInfo,
                    skipped: true,
                }
            }
            suite.children.push(testInfo)
            return testInfo.id
        }
        let label = labels.shift()

        let found = suite.children.find(child => child.label === label)
        if (found && found.type === 'suite') {
            return this.addResult_(found, labels, result)
        }

        const newSuite: TestSuiteInfo = {
            type: 'suite',
            id: suite.id + '/' + label!,
            label: label!,
            children: [],
            file: this.getFilePath(result)
        }
        suite.children.push(newSuite)
        return this.addResult_(newSuite, labels, result)
    }

    private getFilePath(result: Result): string {
        const module = result.labels[0];
        const file = module.replace('.', '/')
        return `${this.folder.uri.fsPath}/tests/${file}.elm`
    }
}
