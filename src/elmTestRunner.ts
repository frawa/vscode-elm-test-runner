import * as vscode from 'vscode';
import * as path from 'path';
import { ResultTree, Node } from './resultTree';
import { DiffProvider } from './diffProvider'

import * as child_process from 'child_process'

export class ElmTestsProvider implements vscode.TreeDataProvider<Node> {

	private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();
	readonly onDidChangeTreeData: vscode.Event<Node | null> = this._onDidChangeTreeData.event;

	private tree: ResultTree = new ResultTree

	private enabled: boolean = true

	constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) {
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

	enable(): void {
		if (this.enabled) {
			return
		}
		this.enabled = true
		this.runElmTestOnce()
	}

	disable(): void {
		if (!this.enabled) {
			return
		}
		this.enabled = false
		this.tree = new ResultTree()
		this._onDidChangeTreeData.fire();
	}

	private runElmTestAgain(path?: string) {
		let elm = child_process.spawn('elm', ['test', '--report', 'json'], {
			cwd: path,
			env: process.env
		})

		if (!this.tree.path) {
			this.tree = new ResultTree(path)
		}
		this.tree.root.running = true
		this._onDidChangeTreeData.fire();

		elm.stdout.on('data', (data: string) => {
			let lines = data.toString().split('\n')
			lines
				.forEach(line => {
					this.tree.parse([line])
					this._onDidChangeTreeData.fire()
				})
		})

		elm.stderr.on('data', (data: string) => {
			let lines = data.toString().split('\n')
			console.log(lines)
		})

		elm.on('close', (code) => {
		});
	}

	getOrCreateTerminal(name: string): vscode.Terminal {
		const terminals = vscode.window.terminals;
		const found = terminals.find(t => t.name == name)

		if (found) {
			return found
		}

		let path = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath
		let terminal = vscode.window.createTerminal({
			name: name,
			cwd: path
			// env: process.env 
		});

		(<any>terminal).onDidWriteData((data: string) => {
			if (data.indexOf('TEST RUN PASSED') > 0 || data.indexOf('TEST RUN FAILED') > 0) {
				this.runElmTestAgain(path);
			}
		})

		return terminal
	}

	runElmTestOnce() {
		if (!this.enabled) {
			return;
		}

		let terminal = this.getOrCreateTerminal('Elm Test Run')

		terminal.sendText("elm test")
		terminal.show();
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
		result.id = node.id

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
		return node.expanded || node.running
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
		if (node.running) {
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
		return node.running ? "... " + node.name : node.name
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

