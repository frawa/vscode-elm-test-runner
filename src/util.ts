import { TestSuiteInfo, TestInfo } from "vscode-test-adapter-api";

export function* walk(node: TestSuiteInfo | TestInfo): Generator<TestSuiteInfo | TestInfo> {
    yield node
    if (node.type === 'suite') {
        for (const child of node.children) {
            for (const c of walk(child)) { yield c; }
        }
    }
}

export function getTestInfosByFile(suite: TestSuiteInfo): Readonly<Map<string, TestInfo[]>> {
    const testInfosByFile = new Map<string, TestInfo[]>()
    Array.from(walk(suite))
        .filter(node => node.file)
        .filter(node => node.type === 'test')
        .forEach(node => {
            const file = node.file!
            const testInfo = node as TestInfo
            const infos = testInfosByFile.get(file)
            if (!infos) {
                testInfosByFile.set(file, [testInfo])
            } else {
                testInfosByFile.set(file, [...infos, testInfo])
            }
        })
    return Object.freeze(testInfosByFile);
}

export function findOffsetForTest(names: string[], text: string): number | undefined {
    const offset = names.reduce(
        (acc: number, name: string) =>
            text.indexOf(`"${name}"`, acc),
        0)
    return offset >= 0 ? offset : undefined
}