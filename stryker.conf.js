/**
 * @type {import('@stryker-mutator/api/core').StrykerOptions}
 */
module.exports = {
  mutator: "typescript",
  packageManager: "yarn",
  reporters: ["html", "clear-text", "progress"],
  testRunner: "mocha",
  transpilers: [],
  testFramework: "mocha",
  coverageAnalysis: "perTest",
  tsconfigFile: "tsconfig.json",
  mutate: [
    "src/*.ts",
    "!src/runner.ts",
    "!src/extension.ts",
    "!src/adapter.ts",
    "!src/test/*.ts"
  ],
};
