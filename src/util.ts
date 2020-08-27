import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";

export function* walk(node: TestSuiteInfo | TestInfo): Generator<TestSuiteInfo | TestInfo> {
    yield node
    if (node.type === 'suite') {
        for (const child of node.children) {
            for (const c of walk(child)) { yield c; }
        }
    }
}