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
	private _running: Boolean = false

	constructor(private context: vscode.ExtensionContext) {
		// this.run()
	}

	run(): void {
		// TODO support multiple workspaces
		let path = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath

		this.tree = new ResultTree(path)
		this._running = true
		this._onDidChangeTreeData.fire();

		const elm = child_process.spawn('elm', ['test', '--report', 'json'], {
			cwd: this.tree.path
		})

		elm.stdout.on('data', (data: string) => {
			console.log(`stdout: ${data.toString()}`);
			this.tree.parse(data.toString().split('\n'))
			this._onDidChangeTreeData.fire();
		})

		elm.stderr.on('data', (data: string) => {
			console.log(`stderr: ${data}`);
			this.tree.errors = data.toString().split('\n')
			this._onDidChangeTreeData.fire();
		})

		elm.on('error', (err) => {
			console.log(`child prcess error ${err}`);
			this._running = false
			this._onDidChangeTreeData.fire();
		})

		elm.on('close', (code: number) => {
			console.log(`child prcess exited with code ${code}`);
			this._running = false
			this._onDidChangeTreeData.fire();
		})
	}

	getChildren(node?: Node): Thenable<Node[]> {
		if (!node && this._running) {
			return Promise.resolve([new Node("Running ...")])
		}
		if (!node) {
			return Promise.resolve(this.tree.root.subs)
		}
		return Promise.resolve(node.subs)
	}

	getTreeItem(node: Node): vscode.TreeItem {
		let result = new vscode.TreeItem(this.getLabel(node), this.getState(node))
		result.iconPath = this.getIcon(node)

		if (node.message) {
			let firstFileInError = new RegExp("^.*?/tests/(.*?)\.elm")
			let matches = firstFileInError.exec(node.message)
			if (matches) {
				let label = matches[1].replace('/', '.')
				result.command = {
					command: 'extension.openElmTestSelection',
					title: '',
					arguments: [[label]]
				}
			}
		} else if (node.result) {
			result.command = {
				command: 'extension.openElmTestSelection',
				title: '',
				arguments: [node.result.labels]
			}
			if (node.canDiff) {
				result.contextValue = 'canDiff'
			}
		}
		return result
	}

	private getState(node: Node): vscode.TreeItemCollapsibleState {
		if (node.message) {
			return vscode.TreeItemCollapsibleState.None
		}
		return node.green || node.result
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.Expanded
	}

	private testPath(file: string): string {
		return `${this.tree.path}/tests/${file}.elm`
	}

	select(labels: string[]) {
		let path = labels[0].replace('.', '/')

		vscode.workspace.openTextDocument(this.testPath(path))
			.then(doc => vscode.window.showTextDocument(doc))
			.then(editor => {
				if (labels.length > 1) {
					let description = '"' + labels[labels.length - 1] + '"'
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
		if (node.message) {
			return null;
		} else if (node.green) {
			let green = this.context.asAbsolutePath(path.join('resources', 'Green_check.svg'))
			return {
				light: green,
				dark: green
			}
		} else {
			let red = this.context.asAbsolutePath(path.join('resources', 'Red_x.svg'))
			return {
				light: red,
				dark: red
			}
		}
	}

	private getLabel(node: Node): string {
		if (node.message) {
			return node.message
		}
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

