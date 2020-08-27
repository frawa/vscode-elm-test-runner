'use strict';

import * as vscode from 'vscode';
import { ElmTestsProvider } from './elmTestRunner'
import { DiffProvider } from './diffProvider'
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api';
import { ExampleAdapter } from './adapter';

export function activate(context: vscode.ExtensionContext) {

    const diffProvider = new DiffProvider();

    const providerRegistration = vscode.Disposable.from(
        vscode.workspace.registerTextDocumentContentProvider(DiffProvider.scheme, diffProvider),
    )

    const outputChannel = vscode.window.createOutputChannel('Elm Test Runner')
    const elmTestsProvider = new ElmTestsProvider(context, outputChannel)
    // vscode.window.registerTreeDataProvider('elmTestRunner', elmTestsProvider)

    const commandRegistrations = vscode.Disposable.from(
        // vscode.commands.registerCommand('elmTestRunner.toggle', () => elmTestsProvider.toggle()),
        // vscode.commands.registerCommand('elmTestRunner.diff', node => elmTestsProvider.diff(node)),
        // vscode.commands.registerCommand('extension.openElmTestSelection', (messages, folderPath, module, testName) => elmTestsProvider.select(messages, folderPath, module, testName)),
    )

    const onSave = vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
        if (doc.languageId === "elm") {
            // elmTestsProvider.runElmTestOnSave(doc)
        }
    });

    context.subscriptions.push(
        commandRegistrations,
        providerRegistration,
        outputChannel,
        onSave
    )

    const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0];

    const log = new Log('elmTestRunner', workspaceFolder, 'Elm Test Runner Log');
    context.subscriptions.push(log);

    // get the Test Explorer extension
    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
    if (log.enabled) { log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`); }

    if (testExplorerExtension) {

        const testHub = testExplorerExtension.exports;

        // this will register an ExampleTestAdapter for each WorkspaceFolder
        context.subscriptions.push(new TestAdapterRegistrar(
            testHub,
            workspaceFolder => new ExampleAdapter(workspaceFolder, log),
            log
        ));
    }

}

export function deactivate() {
}