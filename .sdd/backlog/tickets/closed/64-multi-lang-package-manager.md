# Ticket: 64 Multi-Language Package Manager Support

Spec version: v1.0
Context: Refactoring `src/tools/package_manager.ts` to support Python, Go, Rust, and Java.

## Objective & DoD
- **Objective**: Enable Kotef to detect and manage dependencies for non-Node.js projects.
- **DoD**:
    - `detectPackageManager` correctly identifies pip/poetry, go mod, cargo, maven/gradle.
    - `resolveScriptCommand` returns correct commands (e.g., `poetry run`, `cargo run`).
    - `resolveExecCommand` returns correct commands (e.g., `python -m`, `cargo`).
    - Unit tests cover detection logic for all supported languages.

## Steps
1.  Refactor `PackageManager` type definition to be more flexible (allow non-JS names).
2.  Create a registry of package managers.
3.  Implement detection logic for:
    -   Python: `pyproject.toml`, `requirements.txt`, `Pipfile` -> `pip` or `poetry` or `pipenv`.
    -   Go: `go.mod` -> `go`.
    -   Rust: `Cargo.toml` -> `cargo`.
    -   Java: `pom.xml` -> `maven`, `build.gradle` -> `gradle`.
4.  Implement command resolution for each.

## Affected Files
-   `src/tools/package_manager.ts`

## Tests
-   Create `test/tools/package_manager.test.ts` with mocks for file existence checks.
