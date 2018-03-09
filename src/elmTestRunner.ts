import * as vscode from 'vscode';
import * as path from 'path';
// import { isNumber } from 'util';
import { } from './elmTestResult';
import { ResultTree, Node, Failure } from './elmTestResults';

import * as child_process from 'child_process'


type TreeNode = Node | string

export class ElmTestsProvider implements vscode.TreeDataProvider<TreeNode> {

	private _onDidChangeTreeData: vscode.EventEmitter<Node | null> = new vscode.EventEmitter<Node | null>();
	readonly onDidChangeTreeData: vscode.Event<Node | null> = this._onDidChangeTreeData.event;

	private tree: ResultTree = new ResultTree;
	// private text: string;
	// private editor: vscode.TextEditor;


	constructor(private context: vscode.ExtensionContext) {
		// vscode.window.onDidChangeActiveTextEditor(() => this.onActiveEditorChanged());
		// vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));
		// this.parseTree();
		// this.autoRefresh = vscode.workspace.getConfiguration('jsonOutline').get('autorefresh');
		// vscode.workspace.onDidChangeConfiguration(() => {
		// 	this.autoRefresh = vscode.workspace.getConfiguration('jsonOutline').get('autorefresh');
		// });
		// this.onActiveEditorChanged();
		this.run()
	}

	run(): void {
		// TODO support multiple workspaces
		let path = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath

		this.tree = new ResultTree(path)
		this._onDidChangeTreeData.fire();

		const elm = child_process.spawn('elm', ['test', '--report', 'json'], {
			cwd: this.tree.path
		})

		elm.stdout.on('data', (data: string) => {
			console.log(`stdout: ${data.toString()}`);
			this.tree.parse(data.toString().split('\n'))
			this._onDidChangeTreeData.fire();
		});

		elm.stderr.on('data', (data: string) => {
			console.log(`stderr: ${data}`);
		});

		elm.on('close', (code: number) => {
			console.log(`child prcess exited with code ${code}`);
		});
	}

	getChildren(node?: TreeNode): Thenable<TreeNode[]> {
		if (!node) {
			var topLevel:any[] = []
			Array.prototype.push.apply(topLevel,this.tree.root.subs)
			Array.prototype.push.apply(topLevel,this.tree.stdout)
			return Promise.resolve(topLevel)
		}
		if (node instanceof Node) {
			if (node.result && node.result.failures.length > 0) {
				return Promise.resolve(this.failuresToLines(node.result.failures))
			}
			return Promise.resolve(node.subs)
		}
		return Promise.resolve([])
	}

	failuresToLines(failures: Failure[]): string[] {
		let failureToLines = (failure: Failure) => {
			let result: string[] = []
			if (failure.message) {
				result.push(failure.message)
			}
			if (failure.reason && failure.reason.data && (typeof failure.reason.data !== 'string')) {
				let data = failure.reason.data
				for (let key in data) {
					result.push(`${key}: ${data[key]}`)
				}
			}
			return result
		}

		let result: string[] = []
		failures
			.forEach(failure => result = result.concat(failureToLines(failure)))
		return result;
	}



	// private getChildrenOffsets(node: json.Node): number[] {
	// 	const offsets: number[] = [];
	// 	for (const child of node.children) {
	// 		const childPath = json.getLocation(this.text, child.offset).path
	// 		const childNode = json.findNodeAtLocation(this.tree, childPath);
	// 		if (childNode) {
	// 			offsets.push(childNode.offset);
	// 		}
	// 	}
	// 	return offsets;
	// }

	getTreeItem(node: TreeNode): vscode.TreeItem {
		let result = new vscode.TreeItem(this.getLabel(node), this.getState(node))
		result.iconPath = this.getIcon(node)

		if (node instanceof Node && node.result) {
			result.command = {
				command: 'extension.openElmTestSelection',
				title: '',
				arguments: [node.result.labels]
			};
		}

		return result
	}

	private getState(node: TreeNode): vscode.TreeItemCollapsibleState {
		if (node instanceof Node) {
			if (node.subs.length > 0) {
				return node.green
					? vscode.TreeItemCollapsibleState.Collapsed
					: vscode.TreeItemCollapsibleState.Expanded
			} else if (node.result && node.result.failures.length > 0) {
				return vscode.TreeItemCollapsibleState.Collapsed
			}
		}
		return vscode.TreeItemCollapsibleState.None
	}

	select(labels: string[]) {
		let path = labels[0].replace('.','/')

		let testPath = `${this.tree.path}/tests/${path}.elm`
		vscode.workspace.openTextDocument(testPath)
		return vscode.workspace
			.openTextDocument(testPath)
			.then(doc => vscode.window.showTextDocument(doc))
			.then(editor => {
				let description = '"'+labels[labels.length-1]+'"'
				let offset = editor.document.getText().indexOf(description)
				if (offset>-1) {
					let pos0 = editor.document.positionAt(offset)
					let pos1 = editor.document.positionAt(offset+description.length)
					editor.selection = new vscode.Selection(pos0,pos1)
					editor.revealRange(new vscode.Range(pos0,pos1))
				}
				return vscode.commands.executeCommand('editor.action.selectHighlights')
			})
	}

	private getIcon(node: TreeNode): any {
		if (node instanceof Node) {
			if (node.green) {
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
		return null;
	}

	private getLabel(node: TreeNode): string {
		if (node instanceof Node) {
			return node.name
		}
		return node
	}
}

