# Elm Test Runner 

Running Elm tests in VS Code.

## Features

- Integrated with [Test Explorer UI](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer)
  - Browse results and navigate to sources.
  - Show selected test result.
  - Automatically run tests on changes.
  - Run fewer tests (within the same file).

- Optional: show progress in terminal.
- Support locally installed elm-test/elm binaries (for Elm 0.19).
- Support locally installed elm-make (for Elm 0.18).

## CHANGES

### 0.9.8
- improvements for larger test suites
### 0.9.7
- improved error handling, like missing elm-test binary, resolves #33
- fix finding modules in sub folders, fixes #34

### 0.9.6
- showing elm-test output in a terminal task is now optional
- elm-test error details are shown as Test Explorer UI output

### 0.9.5
- more accurate line information for nested tests
- decorate test failures
- show test durations

### 0.9.1
- only activate for projects with Elm files, fixes #29

