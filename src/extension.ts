'use strict';

import * as vscode from 'vscode';
import { ElmTestsProvider } from './elmTestRunner'
import { DiffProvider } from './diffProvider'

export function activate(context: vscode.ExtensionContext) {

    const diffProvider = new DiffProvider();

    const providerRegistration = vscode.Disposable.from(
        vscode.workspace.registerTextDocumentContentProvider(DiffProvider.scheme, diffProvider),
    )

    const outputChannel = vscode.window.createOutputChannel('Elm Test Runner')
    const elmTestsProvider = new ElmTestsProvider(context, outputChannel)
    vscode.window.registerTreeDataProvider('elmTestRunner', elmTestsProvider)

    const commandRegistrations = vscode.Disposable.from(
        vscode.commands.registerCommand('elmTestRunner.toggle', () => elmTestsProvider.toggle()),
        vscode.commands.registerCommand('elmTestRunner.diff', node => elmTestsProvider.diff(node)),
        vscode.commands.registerCommand('extension.openElmTestSelection', (messages, module, testName) => elmTestsProvider.select(messages, module, testName)),
    )

    const onSave = vscode.workspace.onDidSaveTextDocument((e: vscode.TextDocument) => {
        elmTestsProvider.runElmTestOnce()
    });

    context.subscriptions.push(
        commandRegistrations,
        providerRegistration,
        outputChannel,
        onSave
    )
}

export function deactivate() {
}