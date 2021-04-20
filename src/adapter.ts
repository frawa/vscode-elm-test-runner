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
    TestAdapter,
    TestLoadStartedEvent,
    TestLoadFinishedEvent,
    TestRunStartedEvent,
    TestRunFinishedEvent,
    TestSuiteEvent,
    TestEvent,
} from 'vscode-test-adapter-api'
import { Log } from 'vscode-test-adapter-util'
import { ElmTestRunner } from './runner'

export class ElmTestAdapter implements TestAdapter {
    private disposables: { dispose(): void }[] = []

    private readonly testsEmitter = new vscode.EventEmitter<
        TestLoadStartedEvent | TestLoadFinishedEvent
    >()
    private readonly testStatesEmitter = new vscode.EventEmitter<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    >()
    private readonly autorunEmitter = new vscode.EventEmitter<void>()

    get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
        return this.testsEmitter.event
    }
    get testStates(): vscode.Event<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    > {
        return this.testStatesEmitter.event
    }
    get autorun(): vscode.Event<void> | undefined {
        return this.autorunEmitter.event
    }

    private runner: ElmTestRunner

    constructor(
        public readonly workspace: vscode.WorkspaceFolder,
        private readonly log: Log
    ) {
        this.log.info('Initializing Elm Test Runner adapter')

        this.disposables.push(this.testsEmitter)
        this.disposables.push(this.testStatesEmitter)
        this.disposables.push(this.autorunEmitter)

        this.runner = new ElmTestRunner(this.workspace, this.log)
    }

    async load(): Promise<void> {
        this.log.info('Loading tests')

        this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' })

        try {
            const loadedEvent = await this.runner.runAllTests()
            this.testsEmitter.fire(loadedEvent)
            if (!loadedEvent.errorMessage) {
                await this.runner.fireEvents(
                    loadedEvent.suite!,
                    this.testStatesEmitter
                )
                // await this.runner.fireLineEvents(
                //     loadedEvent.suite!,
                //     this.testStatesEmitter
                // )
                // await this.runner.fireDecorationEvents(
                //     loadedEvent.suite!,
                //     this.testStatesEmitter
                // )
            }
        } catch (error) {
            this.log.info('Failed to load tests', error)
            this.testsEmitter.fire(<TestLoadFinishedEvent>{
                type: 'finished',
                errorMessage: error,
            })
        }
    }

    async run(tests: string[]): Promise<void> {
        this.log.info('Running tests', tests)

        const [files, testIds] = this.runner.getFilesAndAllTestIds(tests)
        this.testStatesEmitter.fire(<TestRunStartedEvent>{
            type: 'started',
            tests: testIds,
        })

        const loadedEvent = await this.runner.runSomeTests(files)
        await this.runner.fireEvents(loadedEvent.suite!, this.testStatesEmitter)
        await this.runner.fireLineEvents(
            loadedEvent.suite!,
            this.testStatesEmitter
        )
        await this.runner.fireDecorationEvents(
            loadedEvent.suite!,
            this.testStatesEmitter
        )

        this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' })
    }

    /*	implement this method if your TestAdapter supports debugging tests
		async debug(tests: string[]): Promise<void> {
			// start a test run in a child process and attach the debugger to it...
		}
	*/

    cancel(): void {
        // TODO
        //this.runner.cancel();
        // in a "real" TestAdapter this would kill the child process for the current test run (if there is any)
        throw new Error('Method not implemented.')
    }

    dispose(): void {
        this.cancel()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
