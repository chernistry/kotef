# Ticket: 67 Multi-Language Diagnostics

Spec version: v1.0
Context: Refactoring `src/tools/lsp.ts` to support diagnostics for Python, Go, Rust, and Java.

## Objective & DoD
- **Objective**: Enable Kotef to get code diagnostics (errors/warnings) for non-Node.js projects.
- **DoD**:
    - `runDiagnostics` works for Python (mypy/pylint), Go (go vet), Rust (cargo check).
    - Common interface `DiagnosticProvider` is used.
    - Fallback to "no diagnostics" if tools are missing, rather than crashing.

## Steps
1.  Rename `src/tools/lsp.ts` to `src/tools/diagnostics.ts`.
2.  Define `DiagnosticProvider` interface.
3.  Implement providers:
    -   `TscProvider` (existing logic).
    -   `CargoCheckProvider` (parses cargo JSON output).
    -   `GoVetProvider` (parses go vet output).
    -   `MypyProvider` (parses mypy output).
4.  Update `coder.ts` and `verifier.ts` to use the new diagnostics module.

## Affected Files
-   `src/tools/lsp.ts` -> `src/tools/diagnostics.ts`
-   `src/agent/nodes/coder.ts`
-   `src/agent/nodes/verifier.ts`

## Tests
-   Create `test/tools/diagnostics.test.ts`.
