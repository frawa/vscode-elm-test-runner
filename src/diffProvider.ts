'use strict';

import * as vscode from 'vscode';

export class DiffProvider implements vscode.TextDocumentContentProvider {

	static scheme = 'elmdiff';

	constructor() {
	}

	// Provider method that takes an uri of the `references`-scheme and
	// resolves its content by (1) running the reference search command
	// and (2) formatting the results
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
