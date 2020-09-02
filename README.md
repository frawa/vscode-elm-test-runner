# Elm Test Runner 

Still draft, please share your thoughts.

Running Elm tests in VS Code.

## Features

- Integrated with [Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer)
  - Browse results and navigate to sources.
  - Show selected test result.
  - Automatically run tests on changes.
  - Run fewer tests (within the same file).

- Show progress in terminal.
- Support locally installed elm-test/elm binaries (for Elm 0.19).
- Support locally installed elm-make (for Elm 0.18).

## CHANGES

### 0.9.5
- more accurate line information for nested tests
- decorate test failures

### 0.9.1
- only activate for projects with Elm files, fixes #29

