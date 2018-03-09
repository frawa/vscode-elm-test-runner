'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ElmTestsProvider } from './elmTestRunner'
import { DiffProvider } from './diffProvider'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "vscode-elm-test-runner" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    // let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
    // The code you place here will be executed every time your command is executed

    const diffProvider = new DiffProvider();

    const providerRegistration = vscode.Disposable.from(
        vscode.workspace.registerTextDocumentContentProvider(DiffProvider.scheme, diffProvider),
    )

    // let disposable = vscode.commands.registerCommand('extension.sayHello', () => {
    //     // vscode.window.showInformationMessage('Hello World!')
    //     //     .then(() =>
    //             vscode.commands.executeCommand('vscode.diff',
    //                 DiffProvider.encodeContent('FW'),
    //                 DiffProvider.encodeContent('FW2'))
    //         // )
    // })
    // context.subscriptions.push(disposable);

    const elmTestsProvider = new ElmTestsProvider(context)
    vscode.window.registerTreeDataProvider('elmTestRunner', elmTestsProvider)

    const commandRegistrations = vscode.Disposable.from(
        vscode.commands.registerCommand('elmTestRunner.run', () => elmTestsProvider.run()),
        vscode.commands.registerCommand('elmTestRunner.diff', node => elmTestsProvider.diff(node)),
        vscode.commands.registerCommand('extension.openElmTestSelection', labels => elmTestsProvider.select(labels))
    )

    context.subscriptions.push(
        commandRegistrations,
        providerRegistration
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
}