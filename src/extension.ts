/*
MIT License

 Copyright 2021 Frank Wagner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
'use strict'

import * as vscode from 'vscode'
import { Log, TestAdapterRegistrar } from 'vscode-test-adapter-util'
import { TestHub, testExplorerExtensionId } from 'vscode-test-adapter-api'
import { ElmTestAdapter } from './adapter'

export function activate(context: vscode.ExtensionContext): void {
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

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function deactivate(): void {}
