# Ticket: 65 Multi-Language Test Runner Support

Spec version: v1.0
Context: Refactoring `src/tools/test_runner.ts` to support Python, Go, Rust, and Java.

## Objective & DoD
- **Objective**: Enable Kotef to run and interpret tests for non-Node.js projects.
- **DoD**:
    - `classifyFailure` correctly identifies failures for Pytest, Go Test, Cargo Test.
    - `runCommand` uses the correct runner based on the detected stack.
    - Unit tests cover failure classification for sample outputs of each language.

## Steps
1.  Refactor `classifyFailure` to use a `FailureClassifier` interface.
2.  Implement classifiers:
    -   `PytestClassifier`: Detects `FAILED`, `ERROR`, `E   AssertionError`.
    -   `GoTestClassifier`: Detects `FAIL`, `build failed`.
    -   `CargoTestClassifier`: Detects `test failed`, `compilation error`.
    -   `JunitClassifier`: Detects `Tests run: ..., Failures: ...`.
3.  Update `runCommand` to select the classifier based on the project stack (reuse `PackageManager` detection or similar).

## Affected Files
-   `src/tools/test_runner.ts`

## Tests
-   Create `test/tools/test_runner.test.ts` with sample stdout/stderr for each language.
