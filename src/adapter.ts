import * as vscode from 'vscode';
import { TestAdapter, TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestSuiteInfo, TestInfo } from 'vscode-test-adapter-api';
import { Log } from 'vscode-test-adapter-util';
import { loadFakeTests, runFakeTests } from './fakeTests';

import * as path from 'path';
import * as child_process from 'child_process'
import * as fs from 'fs';
import * as json from 'jsonc-parser'

/**
 * This class is intended as a starting point for implementing a "real" TestAdapter.
 * The file `README.md` contains further instructions.
 */
export class ExampleAdapter implements TestAdapter {

	private disposables: { dispose(): void }[] = [];

	private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();

	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
	get autorun(): vscode.Event<void> | undefined { return this.autorunEmitter.event; }

	private runner: ElmTestRunner;

	constructor(
		public readonly workspace: vscode.WorkspaceFolder,
		private readonly log: Log
	) {

		this.log.info('Initializing example adapter');

		this.disposables.push(this.testsEmitter);
		this.disposables.push(this.testStatesEmitter);
		this.disposables.push(this.autorunEmitter);

		this.runner = new ElmTestRunner(this.workspace)
	}

	async load(): Promise<void> {

		this.log.info('Loading example tests');

		this.testsEmitter.fire(<TestLoadStartedEvent>{ type: 'started' });

		const loadedEvent = await this.runner.runAllTests();

		this.testsEmitter.fire(loadedEvent);

		await this.runner.fireLineEvents(loadedEvent.suite!, this.testStatesEmitter)
		await this.runner.fireEvents(loadedEvent.suite!, this.testStatesEmitter)
	}

	async run(tests: string[]): Promise<void> {

		this.log.info(`Running example tests ${JSON.stringify(tests)}`);

		this.testStatesEmitter.fire(<TestRunStartedEvent>{ type: 'started', tests });

		// in a "real" TestAdapter this would start a test run in a child process
		await runFakeTests(tests, this.testStatesEmitter);

		this.testStatesEmitter.fire(<TestRunFinishedEvent>{ type: 'finished' });

	}

	/*	implement this method if your TestAdapter supports debugging tests
		async debug(tests: string[]): Promise<void> {
			// start a test run in a child process and attach the debugger to it...
		}
	*/

	cancel(): void {
		// in a "real" TestAdapter this would kill the child process for the current test run (if there is any)
		throw new Error("Method not implemented.");
	}

	dispose(): void {
		this.cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}

class ElmTestRunner {
	private event: TestLoadFinishedEvent = { type: 'finished' }
	private resultById: Map<string, Result> = new Map<string, Result>();

	private resolve: (value?: TestLoadFinishedEvent | PromiseLike<TestLoadFinishedEvent> | undefined) => void = () => { }
	private reject: (reason?: any) => void = () => { }
	private pendingMessages: string[] = [];

	constructor(private folder: vscode.WorkspaceFolder) {
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
			this.event = {
				type: 'finished',
				suite: {
					type: 'suite',
					id: 'root',
					label: 'root',
					children: []
				}
			}
			this.pendingMessages = []
			this.makeAndRunElmTest()
		})
	}

	private makeAndRunElmTest() {
		let kind: vscode.TaskDefinition = {
			type: 'elm-test'
		};

		let cwdPath = this.folder.uri.fsPath
		let args = this.elmTestArgs(cwdPath)

		console.log("Running Elm Tests", args)

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
				(reason) => console.log("Run Elm Test Task failed", reason)
			)

		vscode.tasks.onDidEndTaskProcess((event) => {
			if (task === event.execution.task) {
				if (event.exitCode !== 1) {
					this.runElmTest()
				} else {
					console.error("elm-test failed", event.exitCode)
					this.reject(`elm-test failed with ${event.exitCode}`);
				}
			}
		})
	}

	private runElmTest() {
		let cwdPath = this.folder.uri.fsPath
		let args = this.elmTestArgs(cwdPath)

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
			console.log("stderr", lines)
		})

		elm.on('close', () => {
			this.resolve(this.event);
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
			const id = this.addResult(this.event.suite!, result)
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

function parseTestResult(line: string): (Result | string) {
	var errors: json.ParseError[] = []
	var result: Result = json.parse(line, errors)
	var nojson = errors.find(e => e.error === json.ParseErrorCode.InvalidSymbol)
	if (errors.length > 0 && nojson) {
		return line
	}
	return result
}

interface Result {
	event: string
	status: string
	labels: string[]
	failures: Failure[]
	messages: string[]
	duration: string,
	testCount?: number
}

export interface Failure {
	message: string
	reason: {
		data: any
	}
}

function buildMessage(result: Result): string {
	let failureLines = (acc: string[], failure: Failure) => {
		if (typeof failure === 'string') {
			acc.push(failure)
		} else {
			if (failure.reason && failure.reason.data && (typeof failure.reason.data !== 'string')) {
				let data = failure.reason.data
				if (data.comparison) {
					acc.push(evalStringLiteral(data.actual))
					acc.push(`| ${data.comparison}`)
					acc.push(evalStringLiteral(data.expected))
				} else {
					for (let key in data) {
						acc.push(`${key}: ${data[key]}`)
					}
				}
			} else if (failure.message) {
				acc.push(failure.message)
			}
		}
		return acc
	}

	let lines = result.failures.reduce(failureLines, [])
	return result.messages.concat(lines).join('\n')
}

function evalStringLiteral(value: string): string {
	if (value && value.startsWith('"')) {
		return eval(value).toString()
	}
	return value
}

function* walk(node: TestSuiteInfo | TestInfo): Generator<TestSuiteInfo | TestInfo> {
	yield node
	if (node.type === 'suite') {
		for (const child of node.children) {
			for (const c of walk(child)) { yield c; }
		}
	}
}