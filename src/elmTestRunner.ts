import * as vscode from 'vscode';
import * as path from 'path';
import { ResultTree, Node } from './resultTree';
import { DiffProvider } from './diffProvider'

import * as child_process from 'child_process'

var kill = require('tree-kill'); 

export class ElmTestsProvider implements vscode.TreeDataProvider<Node> {

	private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();
	readonly onDidChangeTreeData: vscode.Event<Node | null> = this._onDidChangeTreeData.event;

	private tree: ResultTree = new ResultTree
	private process?: child_process.ChildProcess
	private runningInfo: any = {
		running: false,
		total: 0,
		current: 0
	}

	constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) {
		this.run()
	}

	private out(lines: string[]): void {
		lines.forEach(line => this.outputChannel.appendLine(line))
	}

	private replaceOut(lines?: string[]): void {
		this.outputChannel.clear()
		if (lines && lines.length > 0) {
			this.out(lines)
			this.outputChannel.show(true)
		}
	}

	stop(): void {
		if (this.process) {
			console.log(`stopping ... ${this.process.pid}`)
			let process = this.process
			this.process = undefined
			this.out([`STOP|${process.pid}|`])
			kill(process.pid)
			console.log(`tree killing ... ${process.pid}`)
			setTimeout(() => {
				kill(process.pid,"SIGKILL")
				console.log(`hard tree killing ... ${process.pid}`)
			}, 3000)
		}
	}

	private restart(): void {
		this.stop()
		console.log(`restarting (after crash?) ...`)
		this.out(['RESTART|'])
		setTimeout(() => this.run(), 1000)
	}

	running(): Thenable<{}> {
		return vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'elm tests' }, p => {
			return new Promise((resolve, reject) => {
				p.report({ message: `Running ${this.runningInfo.total} elm tests` });
				let handle = setInterval(() => {
					p.report({ message: `Running ${this.runningInfo.total} elm tests, at ${this.runningInfo.current}` });
					if (!this.runningInfo.running) {
						clearInterval(handle);
						resolve();
					}
				}, 2000);
			});
		});
	}

	run(): void {
		if (this.process) {
			return
		}
		// TODO support multiple workspaces
		let path = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath

		this.tree = new ResultTree(path)

		this.tree.progress = (current: number, testCount?: number) => {
			if (current === 0) {
				this.replaceOut()
				this._onDidChangeTreeData.fire(this.tree.root);
				this.runningInfo.running = true
				this.runningInfo.total = testCount
				vscode.commands.executeCommand('extension.elmTestsRunning')
			} else if (current === -1) {
				this.runningInfo.running = false
				this._onDidChangeTreeData.fire(this.tree.root);
			} else {
				this.runningInfo.current = current
			}
		}

		// this._onDidChangeTreeData.fire();

		let elm = child_process.spawn('elm', ['test', '--report', 'json', '--watch'], {
			cwd: this.tree.path,
			env: process.env
		})
		this.process = elm;

		elm.stdout.on('data', (data: string) => {
			let lines = data.toString().split('\n')
			console.log(`stdout|${elm.pid}} ${lines}`);
			this.tree.parse(lines)
			this._onDidChangeTreeData.fire();
		})

		elm.stderr.on('data', (data: string) => {
			console.log(`stderr|${elm.pid}| ${data}`)
			let lines = data.toString().split('\n')
			this.tree.errors = lines
			this.out(lines)
			this._onDidChangeTreeData.fire()
		})

		elm.on('error', (err) => {
			let line = err.toString()
			console.log(`child process ${elm.pid} error ${line}`)
			this.tree.errors = [line]
			this.out(['ERROR| ' + line])
			this._onDidChangeTreeData.fire()
		})

		elm.on('close', (code: number) => {
			console.log(`child process ${elm.pid} closed with code ${code}`);
			this.stop()
			this.out(['CLOSE| ' + code])
			this.tree = new ResultTree()
			this._onDidChangeTreeData.fire()
			if (code === 1) {
				this.restart()
			}
		})

		elm.on('exit', (code: number) => {
			console.log(`child prcess ${elm.pid} exited with code ${code}`);
			this.out(['EXIT| ' + code])
			this.tree = new ResultTree()
			this._onDidChangeTreeData.fire()
			if (code !== null && code !== 1) {
				this.restart()
			}
		})
	}

	getChildren(node?: Node): Thenable<Node[]> {
		if (!node) {
			return Promise.resolve(this.tree.root.subs)
		}
		return Promise.resolve(node.subs)
	}

	getTreeItem(node: Node): vscode.TreeItem {
		let result = new vscode.TreeItem(this.getLabel(node), this.getState(node))
		result.iconPath = this.getIcon(node)

		if (node.testModuleAndName) {
			let [module, testName] = node.testModuleAndName
			result.command = {
				command: 'extension.openElmTestSelection',
				title: '',
				arguments: [node.messages, module, testName]
			}
			if (node.canDiff) {
				result.contextValue = 'canDiff'
			}
		} else if (node.testModule) {
			result.command = {
				command: 'extension.openElmTestSelection',
				title: '',
				arguments: [node.messages, node.testModule]
			}
		}
		return result
	}

	private getState(node: Node): vscode.TreeItemCollapsibleState {
		if (node.expanded === undefined) {
			return vscode.TreeItemCollapsibleState.None
		}
		return node.expanded
			? vscode.TreeItemCollapsibleState.Expanded
			: vscode.TreeItemCollapsibleState.Collapsed
	}

	private testPath(module: string): string {
		let file = module.replace('.', '/')
		return `${this.tree.path}/tests/${file}.elm`
	}

	select(messages: string[], module: string, testName?: string) {
		this.replaceOut(messages)
		vscode.workspace.openTextDocument(this.testPath(module))
			.then(doc => vscode.window.showTextDocument(doc))
			.then(editor => {
				if (testName) {
					let description = '"' + testName + '"'
					let offset = editor.document.getText().indexOf(description)
					if (offset > -1) {
						let pos0 = editor.document.positionAt(offset)
						let pos1 = editor.document.positionAt(offset + description.length)
						editor.selection = new vscode.Selection(pos0, pos1)
						editor.revealRange(new vscode.Range(pos0, pos1))
					}
					return vscode.commands.executeCommand('editor.action.selectHighlights')
				}
			})
	}

	private getIcon(node: Node): any {
		if (this.tree.isRunning()) {
			return null
		}
		let icon = node.green
			? this.context.asAbsolutePath(path.join('resources', 'Green_check.svg'))
			: this.context.asAbsolutePath(path.join('resources', 'Red_x.svg'))
		return {
			light: icon,
			dark: icon
		}
	}

	private getLabel(node: Node): string {
		return node.name
	}

	diff(node: Node) {
		let diff = node.diff
		if (diff) {
			vscode.commands.executeCommand('vscode.diff',
				DiffProvider.encodeContent(diff[0]),
				DiffProvider.encodeContent(diff[1]),
				`EXPECTED | ${node.name} | ACTUAL`
			)
		}
	}
}

