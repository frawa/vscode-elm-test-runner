'use strict'

import * as vscode from 'vscode'
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util'
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api'
import { ElmTestAdapter } from './adapter'

export function activate(context: vscode.ExtensionContext) {
    const workspaceFolder = (vscode.workspace.workspaceFolders || [])[0]

    const log = new Log('elmTestRunner', workspaceFolder, 'Elm Test Runner Log')
    context.subscriptions.push(log)

    const testExplorerExtension = vscode.extensions.getExtension<TestHub>(
        testExplorerExtensionId
    )
    if (log.enabled) {
        log.info(`Test Explorer ${testExplorerExtension ? '' : 'not '}found`)
    }

    if (testExplorerExtension) {
        const testHub = testExplorerExtension.exports
        context.subscriptions.push(
            new TestAdapterRegistrar(
                testHub,
                (workspaceFolder) => new ElmTestAdapter(workspaceFolder, log),
                log
            )
        )
    }
}

export function deactivate() {}
