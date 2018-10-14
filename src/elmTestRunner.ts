import * as vscode from 'vscode';
import * as path from 'path';

import { RunState } from './runState';
import { Node } from './resultTree';
import { DiffProvider } from './diffProvider'

import * as child_process from 'child_process'

export class ElmTestsProvider implements vscode.TreeDataProvider<Node> {

	private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();
	readonly onDidChangeTreeData: vscode.Event<Node | null> = this._onDidChangeTreeData.event;

	private _runState = new RunState(true)

	constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) {
		this._runState.runner = (path) => this.runElmTest(path)
		this.enable()
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

	toggle(): void {
		if (this._runState.enabled) {
			this._runState.disable()
			this._onDidChangeTreeData.fire();
		} else {
			this._runState.enable()
			this.enable()
		}
	}

	private enable(): void {
		let unique = this.getUniqueWorkspaceFolder()
		if (unique) {
			this._runState.runFolder(unique.name, unique.uri.fsPath)
		}
	}

	private getUniqueWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length == 1) {
			return vscode.workspace.workspaceFolders[0]
		}
		return undefined
	}

	runElmTestOnSave(doc: vscode.TextDocument) {
		let folder = vscode.workspace.getWorkspaceFolder(doc.uri)
		if (!folder) {
			return
		}
		this._runState.runFolder(folder.name, folder.uri.fsPath)
	}

	private async runElmTest(path: string) {
		let folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(path))
		if (folder) {
			this.runElmTest_(folder)
		}
	}

	private runElmTest_(folder: vscode.WorkspaceFolder) {
		let kind: vscode.TaskDefinition = {
			type: 'elm-test'
		};
		let task = new vscode.Task(kind,
			folder,
			'Run Elm Test', 'Elm Test Run',
			new vscode.ShellExecution(`elm test`, {
				cwd: folder.uri.fsPath
			}),
			"elm")
		task.group = vscode.TaskGroup.Test
		task.presentationOptions = { echo: true, focus: true }

		vscode.tasks
			.executeTask(task)
			.then((_) => this.completeElmTest_(folder),
				(reason) => console.log("Run Elm Test Task failed", reason)
			)
	}

	private completeElmTest_(folder: vscode.WorkspaceFolder) {
		let path = folder.uri.fsPath
		let tree = this._runState.getResultTree(path)

		let elm = child_process.spawn('elm', ['test', '--report', 'json'], {
			cwd: path,
			env: process.env
		})

		elm.stdout.on('data', (data: string) => {
			let lines = data.toString().split('\n')
			lines
				.forEach(line => {
					// console.log(`lines ${lines.length}`)
					tree.parse([line])
					this._onDidChangeTreeData.fire()
				})
		})

		elm.stderr.on('data', (data: string) => {
			let lines = data.toString().split('\n')
			console.log("stderr", lines)
		})

		elm.on('close', () => {
			this._runState.runCompleted(path)
			this._onDidChangeTreeData.fire()
		});
	}

	getChildren(node?: Node): Thenable<Node[]> {
		if (!node) {
			return Promise.resolve(this._runState.getAllResults().subs)
		}
		return Promise.resolve(node.subs)
	}

	getTreeItem(node: Node): vscode.TreeItem {
		let result = new vscode.TreeItem(this.getLabel(node), this.getState(node))
		result.iconPath = this.getIcon(node)
		result.id = node.id

		if (node.testModuleAndName) {
			let [module, testName] = node.testModuleAndName
			let folderPath = this.getFolderPath(node)
			result.command = {
				command: 'extension.openElmTestSelection',
				title: '',
				arguments: [node.messages, folderPath, module, testName]
			}
			if (node.canDiff) {
				result.contextValue = 'canDiff'
			}
		} else if (node.testModule) {
			let folderPath = this.getFolderPath(node)
			result.command = {
				command: 'extension.openElmTestSelection',
				title: '',
				arguments: [node.messages, folderPath, node.testModule]
			}
		}
		return result
	}

	private getState(node: Node): vscode.TreeItemCollapsibleState {
		if (node.expanded === undefined) {
			return vscode.TreeItemCollapsibleState.None
		}
		return node.expanded || this._runState.running
			? vscode.TreeItemCollapsibleState.Expanded
			: vscode.TreeItemCollapsibleState.Collapsed
	}

	private getFolderPath(node: Node): string {
		let name = node.root.name
		if (vscode.workspace.workspaceFolders) {
			let folder = vscode.workspace.workspaceFolders
				.find((folder) => folder.name == name)
			if (folder) {
				return folder.uri.fsPath
			}
		}
		return "."
	}

	private testPath(folderPath: string, module: string): string {
		let file = module.replace('.', '/')
		return `${folderPath}/tests/${file}.elm`
	}

	select(messages: string[], folderPath: string, module: string, testName?: string) {
		this.replaceOut(messages)
		vscode.workspace.openTextDocument(this.testPath(folderPath, module))
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
		if (this._runState.running) {
			return null
		}
		let icon = node.green
			? this.context.asAbsolutePath(path.join('resources', 'outline-check-24px.svg'))
			: this.context.asAbsolutePath(path.join('resources', 'outline-error_outline-24px.svg'))
		return {
			light: icon,
			dark: icon
		}
	}

	private getLabel(node: Node): string {
		return this._runState.running ? "... " + node.name : node.name
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

