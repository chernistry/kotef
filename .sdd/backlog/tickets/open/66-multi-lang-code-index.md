# Ticket: 66 Multi-Language Code Indexing

Spec version: v1.0
Context: Refactoring `src/tools/code_index.ts` to use Tree-sitter for multi-language support.

## Objective & DoD
- **Objective**: Enable Kotef to index and search code symbols in Python, Go, Rust, and Java.
- **DoD**:
    - `CodeIndex` interface is generic.
    - `TreeSitterCodeIndex` implementation works for supported languages.
    - `ts-morph` implementation is preserved for TypeScript/JavaScript (optional, or replaced if tree-sitter is sufficient).
    - Unit tests verify symbol extraction for each language.

## Steps
1.  Add `tree-sitter` (or `web-tree-sitter`) and language grammars (`tree-sitter-python`, `tree-sitter-go`, etc.) as dependencies.
2.  Refactor `CodeIndex` to be an interface.
3.  Implement `TreeSitterCodeIndex` that loads the appropriate grammar based on file extension.
4.  Implement symbol extraction queries (scm files) or logic for each language to find functions, classes, and interfaces.

## Affected Files
-   `src/tools/code_index.ts`
-   `package.json`

## Tests
-   Create `test/tools/code_index.test.ts` with sample files for each language.
