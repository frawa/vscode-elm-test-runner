/*
MIT License

 Copyright 2021 Frank Wagner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import * as vscode from 'vscode'
import {
    TestSuiteInfo,
    TestLoadFinishedEvent,
    TestInfo,
    TestRunStartedEvent,
    TestRunFinishedEvent,
    TestSuiteEvent,
    TestEvent,
    TestDecoration,
} from 'vscode-test-adapter-api'
import path = require('path')
import * as child_process from 'child_process'
import * as fs from 'fs'

import {
    Result,
    buildMessage,
    parseOutput,
    parseErrorOutput,
    buildErrorMessage,
    EventTestCompleted,
    TestStatus,
} from './result'
import {
    getTestInfosByFile,
    findOffsetForTest,
    getFilesAndAllTestIds,
    ElmBinaries,
    buildElmTestArgs,
    buildElmTestArgsWithReport,
    oneLine,
    getFilePathUnderTests,
} from './util'
import { Log } from 'vscode-test-adapter-util'

export class ElmTestRunner {
    private loadedSuite?: TestSuiteInfo = undefined

    private eventById: Map<string, EventTestCompleted> = new Map<
        string,
        EventTestCompleted
    >()

    private resolve: (
        value: TestLoadFinishedEvent | PromiseLike<TestLoadFinishedEvent>
        // eslint-disable-next-line @typescript-eslint/no-empty-function
    ) => void = () => {}
    private loadingSuite?: TestSuiteInfo = undefined
    private loadingErrorMessage?: string = undefined
    private pendingMessages: string[] = []

    constructor(
        private folder: vscode.WorkspaceFolder,
        private readonly log: Log
    ) {}

    async fireEvents(
        node: TestSuiteInfo | TestInfo,
        testStatesEmitter: vscode.EventEmitter<
            | TestRunStartedEvent
            | TestRunFinishedEvent
            | TestSuiteEvent
            | TestEvent
        >
    ): Promise<boolean> {
        if (node.type === 'suite') {
            testStatesEmitter.fire(<TestSuiteEvent>{
                type: 'suite',
                suite: node.id,
                state: 'running',
            })

            for (const child of node.children) {
                await this.fireEvents(child, testStatesEmitter)
            }

            testStatesEmitter.fire(<TestSuiteEvent>{
                type: 'suite',
                suite: node.id,
                state: 'completed',
            })
        } else {
            testStatesEmitter.fire(<TestEvent>{
                type: 'test',
                test: node.id,
                state: 'running',
            })

            const event = this.eventById.get(node.id)
            if (!event) {
                throw new Error(`result for ${node.id}?`)
            }
            const message = buildMessage(event)
            switch (event.status.tag) {
                case 'pass': {
                    testStatesEmitter.fire(<TestEvent>{
                        type: 'test',
                        test: node.id,
                        state: 'passed',
                        message,
                        description: `${event.duration}s`,
                    })
                    break
                }
                case 'todo': {
                    testStatesEmitter.fire(<TestEvent>{
                        type: 'test',
                        test: node.id,
                        state: 'skipped',
                        message,
                    })
                    break
                }
                case 'fail':
                    testStatesEmitter.fire(<TestEvent>{
                        type: 'test',
                        test: node.id,
                        state: 'failed',
                        message,
                    })
                    break
            }
        }
        return true
    }

    async fireLineEvents(
        suite: TestSuiteInfo,
        testStatesEmitter: vscode.EventEmitter<
            | TestRunStartedEvent
            | TestRunFinishedEvent
            | TestSuiteEvent
            | TestEvent
        >
    ): Promise<number> {
        const testInfosByFile = getTestInfosByFile(suite)
        return Promise.all(
            Array.from(testInfosByFile.entries()).map(([file, nodes]) => {
                return vscode.workspace
                    .openTextDocument(file)
                    .then((doc) => {
                        const text = doc.getText()
                        return nodes
                            .map<[number | undefined, string, TestStatus]>(
                                (node) => {
                                    const id = node.id
                                    const event = this.eventById.get(id)
                                    if (!event) {
                                        throw new Error(
                                            `missing event for ${id}`
                                        )
                                    }
                                    const names = event.labels.slice(1)
                                    return [
                                        findOffsetForTest(
                                            names,
                                            text,
                                            (offset) =>
                                                doc.positionAt(offset).character
                                        ),
                                        id,
                                        event.status,
                                    ]
                                }
                            )
                            .filter(([offset]) => offset !== undefined)
                            .map<[number, string, TestStatus]>(
                                ([offset, id, status]) => [
                                    offset ?? 1313,
                                    id,
                                    status,
                                ]
                            )
                            .map<[number, string, TestStatus]>(
                                ([offset, id, status]) => [
                                    doc.positionAt(offset).line ?? 0,
                                    id,
                                    status,
                                ]
                            )
                            .map(
                                ([line, id, status]) =>
                                    <TestEvent>{
                                        type: 'test',
                                        test: id,
                                        state:
                                            status.tag === 'pass'
                                                ? 'passed'
                                                : status.tag === 'todo'
                                                ? 'skipped'
                                                : 'fail',
                                        line,
                                    }
                            )
                    })
                    .then(
                        (events) =>
                            events.map((event) => {
                                testStatesEmitter.fire(event)
                                return true
                            }).length
                    )
            })
        ).then((counts) =>
            counts.length > 0 ? counts.reduce((a, b) => a + b) : 0
        )
    }

    async fireDecorationEvents(
        suite: TestSuiteInfo,
        testStatesEmitter: vscode.EventEmitter<
            | TestRunStartedEvent
            | TestRunFinishedEvent
            | TestSuiteEvent
            | TestEvent
        >
    ): Promise<number> {
        const testInfosByFile = getTestInfosByFile(suite, (test) => {
            const event = this.eventById.get(test.id)
            return event?.status.tag !== 'fail'
        })
        return Promise.all(
            Array.from(testInfosByFile.entries()).map(([file, nodes]) => {
                return vscode.workspace
                    .openTextDocument(file)
                    .then((doc) => {
                        const text = doc.getText()
                        return nodes.map((node) => {
                            const id = node.id
                            const event = this.eventById.get(id)
                            if (event?.status.tag !== 'fail') {
                                return undefined
                            }
                            const names = event.labels.slice(1)
                            const failures = event.status.failures
                            const decorations:
                                | TestDecoration[]
                                | undefined = failures
                                .map((failure) => {
                                    const offset = findOffsetForTest(
                                        names,
                                        text,
                                        (offset) =>
                                            doc.positionAt(offset).character
                                    )
                                    switch (failure.tag) {
                                        case 'comparison': {
                                            const expected = oneLine(
                                                failure.expected
                                            )
                                            const expectedIndex = text.indexOf(
                                                failure.expected,
                                                offset
                                            )
                                            const actual = oneLine(
                                                failure.actual
                                            )
                                            const expectedLine = doc.positionAt(
                                                expectedIndex
                                            ).line
                                            return <TestDecoration>{
                                                line: expectedLine,
                                                message: `${failure.comparison} ${expected} ${actual}`,
                                            }
                                        }
                                        case 'message': {
                                            if (offset) {
                                                const line = doc.positionAt(
                                                    offset
                                                ).line
                                                return <TestDecoration>{
                                                    line: line,
                                                    message: `${failure.message}`,
                                                }
                                            }
                                            break
                                        }
                                        case 'data': {
                                            if (offset) {
                                                const line = doc.positionAt(
                                                    offset
                                                ).line
                                                const message = Object.keys(
                                                    failure.data
                                                )
                                                    .map(
                                                        (key) =>
                                                            `$(key): ${failure.data[key]}`
                                                    )
                                                    .join('\n')
                                                return <TestDecoration>{
                                                    line: line,
                                                    message,
                                                }
                                            }
                                            break
                                        }
                                    }
                                })
                                .filter((v) => v !== undefined)
                                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                .map((v) => v!)
                            if (decorations && decorations.length > 0) {
                                return <TestEvent>{
                                    type: 'test',
                                    test: node.id,
                                    state: 'failed',
                                    decorations,
                                }
                            }
                        })
                    })
                    .then(
                        (events) =>
                            events
                                .filter((v) => v !== undefined)
                                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                .map((v) => v!)
                                .map((event) => {
                                    testStatesEmitter.fire(event)
                                    return true
                                }).length
                    )
            })
        ).then((counts) =>
            counts.length > 0 ? counts.reduce((a, b) => a + b) : 0
        )
    }

    async runAllTests(): Promise<TestLoadFinishedEvent> {
        this.loadedSuite = undefined
        return this.runSomeTests()
    }

    getFilesAndAllTestIds(tests: string[]): [string[], string[]] {
        if (!this.loadedSuite) {
            throw new Error('not loaded?')
        }
        return getFilesAndAllTestIds(tests, this.loadedSuite)
    }

    async runSomeTests(files?: string[]): Promise<TestLoadFinishedEvent> {
        return new Promise<TestLoadFinishedEvent>((resolve) => {
            this.resolve = resolve
            this.loadingSuite = {
                type: 'suite',
                id: 'root',
                label: this.folder.name,
                children: [],
            }
            this.loadingErrorMessage = undefined
            this.pendingMessages = []
            this.runElmTests(files)
        })
    }

    private runElmTests(files?: string[]) {
        const withOutput = vscode.workspace
            .getConfiguration('elmTestRunner', null)
            .get('showElmTestOutput')
        const cwdPath = this.folder.uri.fsPath
        const args = this.elmTestArgs(cwdPath, files)
        if (withOutput) {
            this.runElmTestsWithOutput(cwdPath, args)
        } else {
            this.runElmTestWithReport(cwdPath, args)
        }
    }

    private runElmTestsWithOutput(cwdPath: string, args: string[]) {
        const kind: vscode.TaskDefinition = {
            type: 'elm-test',
        }

        this.log.info('Running Elm Tests as task', args)

        const task = new vscode.Task(
            kind,
            this.folder,
            'Run Elm Test',
            'Elm Test Run',
            new vscode.ShellExecution(args[0], args.slice(1), {
                cwd: cwdPath,
            })
        )
        task.group = vscode.TaskGroup.Test
        task.presentationOptions = {
            clear: true,
            echo: true,
            focus: false,
            reveal: vscode.TaskRevealKind.Never,
            showReuseMessage: false,
        }

        vscode.tasks.executeTask(task)

        vscode.tasks.onDidEndTaskProcess((event) => {
            if (task === event.execution.task) {
                if ((event.exitCode ?? 0) <= 3) {
                    this.runElmTestWithReport(cwdPath, args)
                } else {
                    console.error('elm-test failed', event.exitCode, args)
                    this.log.info(
                        'Running Elm Test task failed',
                        event.exitCode,
                        args
                    )
                    this.resolve({
                        type: 'finished',
                        errorMessage: [
                            'elm-test failed.',
                            'Check for Elm errors,',
                            `find details in the "Task - ${task.name}" terminal.`,
                        ].join('\n'),
                    })
                }
            }
        })
    }

    private runElmTestWithReport(cwdPath: string, args: string[]) {
        this.log.info('Running Elm Tests', args)

        const argsWithReport = buildElmTestArgsWithReport(args)
        const elm = child_process.spawn(
            argsWithReport[0],
            argsWithReport.slice(1),
            {
                cwd: cwdPath,
                env: process.env,
            }
        )

        const outChunks: Buffer[] = []
        elm.stdout.on('data', (chunk) => outChunks.push(Buffer.from(chunk)))

        const errChunks: Buffer[] = []
        elm.stderr.on('data', (chunk) => errChunks.push(Buffer.from(chunk)))

        elm.on('error', (err) => {
            const message = `Failed to run Elm Tests, is elm-test installed at ${args[0]}?`
            this.log.error(message, err)
            this.resolve({
                type: 'finished',
                errorMessage: message,
            })
        })

        elm.on('close', () => {
            const data = Buffer.concat(outChunks).toString('utf8')
            const lines = data.split('\n')
            try {
                this.parse(lines)
            } catch (err) {
                this.log.warn('Failed to parse line', args)
            }

            if (errChunks.length > 0) {
                const data = Buffer.concat(errChunks).toString('utf8')
                const lines = data.split('\n')
                this.loadingErrorMessage = lines
                    .map(parseErrorOutput)
                    .map(buildErrorMessage)
                    .join('\n')
            }

            if (this.loadingErrorMessage) {
                this.resolve({
                    type: 'finished',
                    errorMessage: this.loadingErrorMessage,
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
        return buildElmTestArgs(this.getElmBinaries(projectFolder), files)
    }

    private getElmBinaries(projectFolder: string): ElmBinaries {
        return {
            elmTest: this.findLocalNpmBinary('elm-test', projectFolder),
            elmMake: this.findLocalNpmBinary('elm-make', projectFolder),
            elm: this.findLocalNpmBinary('elm', projectFolder),
        }
    }

    private findLocalNpmBinary(
        binary: string,
        projectRoot: string
    ): string | undefined {
        const binaryPath = path.join(
            projectRoot,
            'node_modules',
            '.bin',
            binary
        )
        return fs.existsSync(binaryPath) ? binaryPath : undefined
    }

    private parse(lines: string[]): void {
        lines
            .filter((line) => line.length > 0)
            .map((line) => {
                try {
                    return parseOutput(line)
                } catch (err) {
                    this.log.warn('Failed to parse line', line, err)
                    return undefined
                }
            })
            .forEach((output) => {
                switch (output?.type) {
                    case 'message':
                        this.pushMessage(output.line)
                        break
                    case 'result':
                        this.accept(output)
                }
            })
    }

    private pushMessage(message: string): void {
        if (!message) {
            return
        }
        this.pendingMessages.push(message)
    }

    private popMessages(): string[] {
        const result = this.pendingMessages
        this.pendingMessages = []
        return result
    }

    private accept(result: Result): void {
        switch (result?.event.tag) {
            case 'testCompleted': {
                if (!this.loadingSuite) {
                    throw new Error('not loading?')
                }
                const event: EventTestCompleted = {
                    ...result.event,
                    messages: this.popMessages(),
                }
                const labels: string[] = [...event.labels]
                const id = this.addEvent(this.loadingSuite, labels, event)
                this.eventById.set(id, event)
            }
            case 'runStart':
                break
            case 'runComplete':
                break
        }
    }

    private addEvent(
        suite: TestSuiteInfo,
        labels: string[],
        event: EventTestCompleted
    ): string {
        if (labels.length === 1) {
            let testInfo: TestInfo = {
                type: 'test',
                id: suite.id + '/' + labels[0],
                label: labels[0],
                file: this.getFilePath(event),
            }
            if (event.status.tag === 'todo') {
                testInfo = {
                    ...testInfo,
                    skipped: true,
                }
            }
            suite.children.push(testInfo)
            return testInfo.id
        }
        if (labels.length === 0) {
            throw new Error('empy labels?')
        }
        const label = labels.shift() ?? 'empty?'

        const found = suite.children.find((child) => child.label === label)
        if (found && found.type === 'suite') {
            return this.addEvent(found, labels, event)
        }

        const newSuite: TestSuiteInfo = {
            type: 'suite',
            id: suite.id + '/' + label,
            label: label,
            children: [],
            file: this.getFilePath(event),
        }
        suite.children.push(newSuite)
        return this.addEvent(newSuite, labels, event)
    }

    private getFilePath(event: EventTestCompleted): string {
        const path = getFilePathUnderTests(event)
        return `${this.folder.uri.fsPath}/tests/${path}`
    }
}
