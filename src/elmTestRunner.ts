import * as vscode from 'vscode';
import * as path from 'path';
import { } from './elmTestResult';
import { ResultTree, Node } from './resultTree';
import { DiffProvider } from './diffProvider'

import * as child_process from 'child_process'


export class ElmTestsProvider implements vscode.TreeDataProvider<Node> {

	private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();
	readonly onDidChangeTreeData: vscode.Event<Node | null> = this._onDidChangeTreeData.event;

	private tree: ResultTree = new ResultTree
	private process?: child_process.ChildProcess

	constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) {
		this.run()
	}

	private out(lines: string[]): void {
		lines.forEach(line => this.outputChannel.appendLine(line))
		this.outputChannel.show(true)
	}

	private replaceOut(lines: string[]): void {
		if (lines.length > 0) {
			this.outputChannel.clear()
			this.out(lines)
		}
	}

	stop(): void {
		if (this.process) {
			console.log(`stopping ...`)
			this.out(['STOP|'])
			this.process.kill()
			this.process = undefined
		}
	}

	private restart(): void {
		this.stop()
		console.log(`restarting (after crash?) ...`)
		this.out(['RESTART|'])
		setTimeout(() => this.run(), 1000)
	}

	run(): void {
		if (this.process) {
			return
		}
		// TODO support multiple workspaces
		let path = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath

		this.tree = new ResultTree(path)
		this._onDidChangeTreeData.fire();

		let elm = child_process.spawn('elm', ['test', '--report', 'json', '--watch'], {
			cwd: this.tree.path
		})
		this.process = elm;

		elm.stdout.on('data', (data: string) => {
			let lines = data.toString().split('\n')
			console.log(`stdout: ${lines}`);
			this.tree.parse(lines)
			this._onDidChangeTreeData.fire();
		})

		elm.stderr.on('data', (data: string) => {
			console.log(`stderr: ${data}`)
			let lines = data.toString().split('\n')
			this.tree.errors = lines
			this.out(lines)
			this._onDidChangeTreeData.fire()
		})

		elm.on('error', (err) => {
			let line = err.toString()
			console.log(`child prcess error ${line}`)
			this.tree.errors = [line]
			this.out(['ERROR| ' + line])
			this._onDidChangeTreeData.fire()
		})

		elm.on('close', (code: number) => {
			console.log(`child prcess closed with code ${code}`);
			this.stop()
			this.out(['CLOSE| ' + code])
			this.tree = new ResultTree()
			this._onDidChangeTreeData.fire()
		})

		elm.on('exit', (code: number) => {
			console.log(`child prcess exited with code ${code}`);
			this.out(['EXIT| ' + code])
			this.tree = new ResultTree()
			this._onDidChangeTreeData.fire()
			if (code !== null) {
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

