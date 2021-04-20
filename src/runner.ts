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

    private resultById: Map<string, Result> = new Map<string, Result>()

    private resolve: (
        value: TestLoadFinishedEvent | PromiseLike<TestLoadFinishedEvent>
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
            // node.type === 'test'

            testStatesEmitter.fire(<TestEvent>{
                type: 'test',
                test: node.id,
                state: 'running',
            })

            const result = this.resultById.get(node.id)
            const message = buildMessage(result!)
            if (result?.event.tag !== 'testCompleted') {
                return true
            }
            const event: EventTestCompleted = result.event
            switch (result.event.status.tag) {
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
                            .map((node) => {
                                const id = node.id
                                const result = this.resultById.get(id)
                                if (result?.event.tag !== 'testCompleted') {
                                    return [undefined]
                                }
                                const names = result?.event.labels.slice(1)
                                const status = result?.event.status
                                return [
                                    findOffsetForTest(
                                        names!,
                                        text,
                                        (offset) =>
                                            doc.positionAt(offset).character
                                    ),
                                    id,
                                    status.tag,
                                ] as [number | undefined, string, string]
                            })
                            .filter(([offset]) => offset !== undefined)
                            .map(
                                ([offset, id, status]) =>
                                    [
                                        doc.positionAt(offset!).line ?? 0,
                                        id,
                                        status,
                                    ] as [number, string, string]
                            )
                            .map(
                                ([line, id, status]) =>
                                    <TestEvent>{
                                        type: 'test',
                                        test: id,
                                        state:
                                            status === 'pass'
                                                ? 'passed'
                                                : status === 'toto'
                                                ? 'skipped'
                                                : 'fail',
                                        line,
                                    }
                            )
                    })
                    .then(
                        (events) =>
                            events.map((event) => {
                                console.log('FW', event)
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
            const result = this.resultById.get(test.id)
            const status =
                result?.event.tag === 'testCompleted' && result.event.status.tag
            return status !== 'pass' && status !== 'todo'
        })
        return Promise.all(
            Array.from(testInfosByFile.entries()).map(([file, nodes]) => {
                return vscode.workspace
                    .openTextDocument(file)
                    .then((doc) => {
                        const text = doc.getText()
                        return nodes.map((node) => {
                            const id = node.id
                            const result = this.resultById.get(id)
                            if (result?.event.tag !== 'testCompleted') {
                                return undefined
                            }
                            if (result.event.status.tag !== 'fail') {
                                return undefined
                            }
                            const names = result.event.labels.slice(1)
                            const failures = result.event.status.failures
                            const decorations:
                                | TestDecoration[]
                                | undefined = failures
                                .map((failure) => {
                                    const offset = findOffsetForTest(
                                        names!,
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
        return getFilesAndAllTestIds(tests, this.loadedSuite!)
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
            type: 'elm-test',
        }

        this.log.info('Running Elm Tests as task', args)

        let task = new vscode.Task(
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

        vscode.tasks.executeTask(task).then(() => {})

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
        let elm = child_process.spawn(
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
            this.parse(lines)

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
        let binaryPath = path.join(projectRoot, 'node_modules', '.bin', binary)
        return fs.existsSync(binaryPath) ? binaryPath : undefined
    }

    private parse(lines: string[]): void {
        lines
            .filter((line) => line.length > 0)
            .map(parseOutput)
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
        let result = this.pendingMessages
        this.pendingMessages = []
        return result
    }

    private accept(result: Result): void {
        switch (result?.event.tag) {
            case 'testCompleted': {
                result.messages = this.popMessages()
                const id = this.addResult(this.loadingSuite!, result)
                this.resultById.set(id, result)
            }
            case 'runStart':
                break
            case 'runComplete':
                break
        }
    }

    private addResult(suite: TestSuiteInfo, result: Result): string {
        if (result?.event.tag !== 'testCompleted') {
            return '?' // TODO
        }
        const event = result.event
        const labels: string[] = event.labels.concat(event.labels)
        return this.addResult_(suite, labels, event)
    }

    private addResult_(
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
        let label = labels.shift()

        let found = suite.children.find((child) => child.label === label)
        if (found && found.type === 'suite') {
            return this.addResult_(found, labels, event)
        }

        const newSuite: TestSuiteInfo = {
            type: 'suite',
            id: suite.id + '/' + label!,
            label: label!,
            children: [],
            file: this.getFilePath(event),
        }
        suite.children.push(newSuite)
        return this.addResult_(newSuite, labels, event)
    }

    private getFilePath(event: EventTestCompleted): string {
        const path = getFilePathUnderTests(event)
        return `${this.folder.uri.fsPath}/tests/${path}`
    }
}
