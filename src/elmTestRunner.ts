import * as vscode from 'vscode';
import * as path from 'path';
import { isNumber } from 'util';
import { } from './elmTestResult';
import { ResultTree, Node } from './elmTestResults';

export class ElmTestsProvider implements vscode.TreeDataProvider<Node> {

	// private _onDidChangeTreeData: vscode.EventEmitter<number | null> = new vscode.EventEmitter<number | null>();
	// readonly onDidChangeTreeData: vscode.Event<number | null> = this._onDidChangeTreeData.event;

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

		let dummy = [
			'{"event":"runStart","testCount":"9","fuzzRuns":"100","paths":[],"initialSeed":"927798309"}'
			, '{"event":"testCompleted","status":"pass","labels":["JenkinsTest","The Jenkins module","Data","can save"],"failures":[],"duration":"0"}'
			, '{"event":"testCompleted","status":"pass","labels":["JenkinsTest","The Jenkins module","Data","can not save"],"failures":[],"duration":"1"}'
			, '{"event":"testCompleted","status":"pass","labels":["JenkinsTest","The Jenkins module","Data","copy"],"failures":[],"duration":"1"}'
			, '{"event":"runComplete","passed":"9","failed":"0","duration":"239","autoFail":null}'
		]

		this.tree = new ResultTree
		this.tree.parse(dummy);
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

