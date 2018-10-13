import * as vscode from 'vscode';
import * as path from 'path';
import { ResultTree, Node } from './resultTree';
import { DiffProvider } from './diffProvider'

import * as child_process from 'child_process'

export class ElmTestsProvider implements vscode.TreeDataProvider<Node> {

	private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();
	readonly onDidChangeTreeData: vscode.Event<Node | null> = this._onDidChangeTreeData.event;

	private enabled: boolean = true
	private _running: boolean = false
	private _skipped: number = 0

	private _workspaceFolder?: vscode.WorkspaceFolder
	private tree: ResultTree = new ResultTree(this.enabled)

	constructor(private context: vscode.ExtensionContext, private outputChannel: vscode.OutputChannel) {
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
		if (this.enabled) {
			this.disable()
		} else {
			this.enable()
		}
	}

	private enable(): void {
		this.enabled = true
		this._running = false
		let unique = this.getUniqueWorkspaceFolder()
		if (unique) {
			this.workspaceFolder = unique
			this.runElmTest()
		}
	}

	private getUniqueWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length == 1) {
			return vscode.workspace.workspaceFolders[0]
		}
		return undefined
	}

	private disable(): void {
		if (!this.enabled) {
			return
		}
		this.enabled = false
		this._workspaceFolder = undefined
		this.tree = new ResultTree(this.enabled)
		this._onDidChangeTreeData.fire();
	}

	private set workspaceFolder(folder: vscode.WorkspaceFolder) {
		if (folder != this._workspaceFolder) {
			this._workspaceFolder = folder
			let path = folder.uri.fsPath
			this.tree = new ResultTree(this.enabled, path)
		}
	}

	private set running(toggle: boolean) {
		if (this._running == toggle) {
			return
		}

		this._running = toggle
		if (toggle) {
			this._skipped = 0
		} else if (this._skipped > 0) {
			console.info(`Catching up ${this._skipped} triggers.`)
			setTimeout(() => this.runElmTest(), 500)
		}
		this._onDidChangeTreeData.fire();
	}

	private get running(): boolean {
		return this._running
	}

	private needToSkip(folder: vscode.WorkspaceFolder): boolean {
		if (this._running) {
			if (this.workspaceFolder == folder) {
				this._skipped++
			} else {
				// while running, ignore triggers for other workspaces
				console.warn(`Running Elm tests in ${this.workspaceFolder.name}, ignoring ${folder.name}. Please try again later.`)
			}
			return true
		}
		return false
	}

	private runElmTestAgain() {
		let elm = child_process.spawn('elm', ['test', '--report', 'json'], {
			cwd: this.tree.path,
			env: process.env
		})

		elm.stdout.on('data', (data: string) => {
			let lines = data.toString().split('\n')
			lines
				.forEach(line => {
					// console.log(`lines ${lines.length}`)
					this.tree.parse([line])
					this._onDidChangeTreeData.fire()
				})
		})

		elm.stderr.on('data', (data: string) => {
			let lines = data.toString().split('\n')
			console.log(lines)
		})

		elm.on('close', (code) => {
			this.running = false
		});
	}

	runElmTestOnSave(doc: vscode.TextDocument) {
		let folder = vscode.workspace.getWorkspaceFolder(doc.uri)
		if (!folder) {
			return
		}
		if (this.needToSkip(folder)) {
			return
		}
		this.workspaceFolder = folder
		this.runElmTest()
	}

	private runElmTest() {
		if (!this.enabled) {
			return
		}

		if (!this._workspaceFolder) {
			return
		}

		this.running = true

		let kind: vscode.TaskDefinition = {
			type: 'elm-test'
		};
		let task = new vscode.Task(kind,
			this._workspaceFolder,
			'Run Elm Test', 'Elm Test Run',
			new vscode.ShellExecution(`elm test`, {
				cwd: this.tree.path
			}),
			"elm")
		task.group = vscode.TaskGroup.Test
		task.presentationOptions = { echo: true, focus: true }

		vscode.tasks
			.executeTask(task)
			.then((_) => this.runElmTestAgain(),
				(reason) => console.log("Run Elm Test Task failed", reason)
			)
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
		return node.expanded || this.running
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
		if (this.running) {
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
		return this.running ? "... " + node.name : node.name
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

