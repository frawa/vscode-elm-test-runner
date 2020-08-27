import * as vscode from 'vscode';
import { TestSuiteInfo, TestLoadFinishedEvent, TestInfo, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent } from "vscode-test-adapter-api";
import path = require("path");
import * as child_process from 'child_process'
import * as fs from 'fs';

import { Result, buildMessage, parseTestResult } from "./result";
import { walk } from './util';
import { Log } from 'vscode-test-adapter-util';

export class ElmTestRunner {
    private loadedSuite?: TestSuiteInfo = undefined

    private resultById: Map<string, Result> = new Map<string, Result>();

    private reject: (reason?: any) => void = () => { }
    private resolve: (value?: TestLoadFinishedEvent | PromiseLike<TestLoadFinishedEvent> | undefined) => void = () => { }
    private loadingSuite?: TestSuiteInfo = undefined
    private pendingMessages: string[] = [];

    constructor(
        private folder: vscode.WorkspaceFolder,
        private readonly log: Log) {
    }

    async fireLineEvents(node: TestSuiteInfo | TestInfo, testStatesEmitter: vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>): Promise<number> {
        const testInfosByFile = new Map<string, TestInfo[]>()
        Array.from(walk(node))
            .filter(node => node.file)
            .filter(node => node.type === 'test')
            .forEach(node => {
                const file = node.file!
                const testInfo = node as TestInfo
                const infos = testInfosByFile.get(file)
                if (!infos) {
                    testInfosByFile.set(file, [testInfo])
                } else {
                    testInfosByFile.set(file, [...infos, testInfo])
                }
            })

        return Promise.all(
            Array.from(testInfosByFile.entries())
                .map(([file, nodes]) =>
                    vscode.workspace.openTextDocument(file)
                        .then(doc => nodes.map(node => {
                            const result = this.resultById.get(node.id);
                            const testNames = result?.labels.slice(1)
                            let offset: number | undefined = undefined
                            testNames?.forEach(testName => {
                                const description = '"' + testName + '"'
                                offset = doc.getText().indexOf(description, offset)
                            })
                            if (offset) {
                                const line = doc.positionAt(offset).line
                                return { type: 'test', test: node.id, line } as TestEvent
                            }
                            return undefined
                        }))
                        .then(events => events.map(event => {
                            testStatesEmitter.fire(event)
                            return true
                        }).length)
                )
        ).then(counts => counts.reduce((a, b) => a + b))
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
                    testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'passed', message });
                    break;
                }
                case 'todo': {
                    testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'skipped', message });
                    break;
                }
                default:
                    testStatesEmitter.fire(<TestEvent>{ type: 'test', test: node.id, state: 'failed', message });
                    break;
            }

        }
        return Promise.resolve(true);
    }

    async runAllTests(): Promise<TestLoadFinishedEvent> {
        return new Promise<TestLoadFinishedEvent>((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
            this.loadedSuite = undefined
            this.loadingSuite = {
                type: 'suite',
                id: 'root',
                label: 'root',
                children: []
            }
            this.pendingMessages = []
            this.makeAndRunElmTest()
        })
    }

    getFilesAndTestIds(tests: string[]): [string[], string[]] {
        const selectedIds = new Set(tests)
        const files = Array.from(walk(this.loadedSuite!))
            .filter(node => selectedIds.has(node.id))
            .filter(node => node.file)
            .map(node => node.file!)

        const selectedFiles = new Set(files)
        const testIds = Array.from(walk(this.loadedSuite!))
            .filter(node => node.file)
            .filter(node => selectedFiles.has(node.file!))
            .map(node => node.id!)

        return [files, testIds]
    }

    async runSomeTests(files: string[]): Promise<TestLoadFinishedEvent> {
        return new Promise<TestLoadFinishedEvent>((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
            this.loadingSuite = {
                type: 'suite',
                id: 'root',
                label: 'root',
                children: []
            }
            this.pendingMessages = []
            this.makeAndRunElmTest(files)
        })
    }

    private makeAndRunElmTest(files?: string[]) {
        let kind: vscode.TaskDefinition = {
            type: 'elm-test'
        };

        let cwdPath = this.folder.uri.fsPath
        let args = this.elmTestArgs(cwdPath)
        if (files) {
            args = args.concat(files)
        }

        this.log.info("Running Elm Tests", args)

        let task = new vscode.Task(kind,
            this.folder,
            'Run Elm Test', 'Elm Test Run',
            // TODO make only
            new vscode.ShellExecution(args[0], args.slice(1), {
                cwd: cwdPath
            }),
            "elm")
        task.group = vscode.TaskGroup.Test
        task.presentationOptions = { echo: true, focus: true }

        vscode.tasks
            .executeTask(task)
            .then(
                () => { },
                (reason) => this.log.error("Run Elm Test Task failed", reason)
            )

        vscode.tasks.onDidEndTaskProcess((event) => {
            if (task === event.execution.task) {
                if (event.exitCode !== 1) {
                    this.runElmTest(files)
                } else {
                    console.error("elm-test failed", event.exitCode)
                    this.reject(`elm-test failed with ${event.exitCode}`);
                }
            }
        })
    }

    private runElmTest(files?: string[]) {
        let cwdPath = this.folder.uri.fsPath
        let args = this.elmTestArgs(cwdPath)
        if (files) {
            args = args.concat(files)
        }

        let elm = child_process.spawn(args[0], args.slice(1).concat(['--report', 'json']), {
            cwd: cwdPath,
            env: process.env
        })

        elm.stdout.on('data', (data: string) => {
            let lines = data.toString().split('\n')
            lines
                .forEach(line => {
                    this.parse([line])
                })
        })

        elm.stderr.on('data', (data: string) => {
            let lines = data.toString().split('\n')
            this.log.error("stderr", lines)
        })

        elm.on('close', () => {
            if (!this.loadedSuite) {
                this.loadedSuite = this.loadingSuite
            }
            this.resolve({
                type: 'finished',
                suite: this.loadedSuite
            });
        });
    }

    private elmTestArgs(projectFolder: string): string[] {
        let elmTestBinary = this.findLocalNpmBinary('elm-test', projectFolder)
        let elmMakeBinary = this.findLocalNpmBinary('elm-make', projectFolder)
        let elmBinary = elmMakeBinary
            ? elmMakeBinary
            : this.findLocalNpmBinary('elm', projectFolder)

        return [elmTestBinary ? elmTestBinary : 'elm-test']
            .concat(elmBinary ? ['--compiler', elmBinary] : [])
    }

    private findLocalNpmBinary(binary: string, projectRoot: string): string | undefined {
        let binaryPath = path.join(projectRoot, 'node_modules', '.bin', binary)
        return fs.existsSync(binaryPath) ? binaryPath : undefined
    }

    private parse(lines: string[]): void {
        lines
            .map(parseTestResult)
            .forEach(result => {
                if (typeof result === 'string') {
                    this.pushMessage(result)
                } else {
                    this.accept(result)
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
                description: labels[0],
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
            description: label,
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
