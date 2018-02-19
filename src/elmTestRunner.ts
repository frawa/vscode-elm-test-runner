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
		console.log("FW", context.extensionPath)
		this.run()
	}

	run(): void {
		this.tree = new ResultTree
		this._onDidChangeTreeData.fire();

		// TODO support multiple workspaces
		// console.log("FW",vscode.workspace.rootPath)

		const elm = child_process.spawn('elm', ['test', '--report', 'json'], {
			cwd: vscode.workspace.rootPath
		});

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
			return Promise.resolve(this.tree.root.subs)
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
			if (failure.reason && failure.reason.data && (typeof failure.reason.data !== 'string') ) {
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
		// result.contextValue = valueNode.type
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

	select(range: vscode.Range) {
		// this.editor.selection = new vscode.Selection(range.start, range.end);
		// this.editor.revealRange(range)
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

