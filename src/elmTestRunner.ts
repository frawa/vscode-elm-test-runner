import * as vscode from 'vscode';
// import * as path from 'path';
// import { isNumber } from 'util';
import { } from './elmTestResult';
import { ResultTree, Node } from './elmTestResults';

import * as child_process from 'child_process'

export class ElmTestsProvider implements vscode.TreeDataProvider<Node> {

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

	getChildren(node?: Node): Thenable<Node[]> {
		return Promise.resolve(node ? node.subs : this.tree.root.subs)
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

	getTreeItem(node: Node): vscode.TreeItem {
		let result = new vscode.TreeItem(this.getLabel(node), this.getState(node))
		result.iconPath = this.getIcon(node)
		// result.contextValue = valueNode.type
		return result
		// treeItem.command = {
		// 	command: 'extension.openJsonSelection',
		// 	title: '',
		// 	arguments: [new vscode.Range(this.editor.document.positionAt(valueNode.offset), this.editor.document.positionAt(valueNode.offset + valueNode.length))]
		// };
	}

	private getState(node: Node): vscode.TreeItemCollapsibleState {
		if (node.subs.length > 0) {
			return vscode.TreeItemCollapsibleState.Expanded
		}
		return vscode.TreeItemCollapsibleState.None
	}

	select(range: vscode.Range) {
		// this.editor.selection = new vscode.Selection(range.start, range.end);
		// this.editor.revealRange(range)
	}

	private getIcon(node: Node): any {
		// 	let nodeType = node.type;
		// 	if (nodeType === 'boolean') {
		// 		return {
		// 			light: this.context.asAbsolutePath(path.join('resources', 'light', 'boolean.svg')),
		// 			dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'boolean.svg'))
		// 		}
		// 	}
		// 	if (nodeType === 'string') {
		// 		return {
		// 			light: this.context.asAbsolutePath(path.join('resources', 'light', 'string.svg')),
		// 			dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'string.svg'))
		// 		}
		// 	}
		// 	if (nodeType === 'number') {
		// 		return {
		// 			light: this.context.asAbsolutePath(path.join('resources', 'light', 'number.svg')),
		// 			dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'number.svg'))
		// 		}
		// 	}
		return null;
	}

	private getLabel(node: Node): string {
		return node.name
	}
}

