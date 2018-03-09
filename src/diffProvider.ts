'use strict';

import * as vscode from 'vscode';

export class DiffProvider implements vscode.TextDocumentContentProvider {

	static scheme = 'elmdiff';

	constructor() {
	}

	provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
		return this.decodeContent(uri);
	}

	private decodeContent(uri: vscode.Uri): string {
		return uri.query
	}

	public static encodeContent(content: string): vscode.Uri {
		return vscode.Uri.parse(`${DiffProvider.scheme}:content?${content}`);
	}
}
