# Ticket: 33 Code Context Retrieval & File Read Caching

Spec version: v1.3  
Context: `.sdd/architect.md` (Search & Repo Understanding layers), `.sdd/context/arch_refactor.md` (sections 4.1, 4.5, 6.5), Coder behaviour in logs where it repeatedly reads the same files, state/budgets in `src/agent/state.ts` and `src/agent/nodes/coder.ts`.  
Dependencies: 19 (performance & tool efficiency), 20 (repo understanding & context loading), 24 (error‑first execution), 30 (command runner).

## Objective & Definition of Done

Reduce wasted Coder turns by introducing a **code context retrieval layer and file‑read caching**, so that:

- the agent stops re‑reading the same files blindly,
- it can ask for “relevant context” instead of raw `read_file` spam,
- future advanced features (AST diffs, structural search) have a natural home.

### Definition of Done

- [ ] A new high‑level tool exists (e.g. `get_code_context`) that:
  - [ ] accepts a query (file path, symbol name, or error location),
  - [ ] returns a bundle of relevant code snippets (with file paths and surrounding context),
  - [ ] reuses previously read/parsed files where possible.
- [ ] Internally, `get_code_context`:
  - [ ] maintains a small in‑memory index of parsed files (starting with TS/JS via `ts-morph` or similar),
  - [ ] falls back to `read_file` for non‑indexed stacks.
- [ ] Coder prompt is updated to:
  - [ ] prefer `get_code_context` over repeated `read_file` calls when exploring,
  - [ ] avoid re‑reading files that are already in context unless necessary (e.g. after a patch).
- [ ] Budgets (`commandsUsed`) reflect that multiple raw `read_file` calls have been replaced by fewer, richer context fetches.

## Steps

1. **Design code context API**
   - [ ] Define a TypeScript interface in `src/agent/utils/code_context.ts`:

```ts
export interface CodeSnippet {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface CodeContextRequest {
  file?: string;
  symbol?: string;
  errorMessage?: string;
}

export async function getCodeContext(req: CodeContextRequest): Promise<CodeSnippet[]> { ... }
```

   - [ ] Decide on minimal initial query types (e.g. by file + optional symbol).

2. **Indexing implementation (MVP)**
   - [ ] Use `ts-morph` or a light wrapper around the TS compiler API to:
     - [ ] parse `.ts`/`.tsx` files in the project when first requested,
     - [ ] cache ASTs in memory for the duration of the run.
   - [ ] Implement simple symbol lookup (e.g. function/class/component names) to return snippets.

3. **Integration with tools**
   - [ ] Expose a new tool in `coderNode` tool list:
     - [ ] `get_code_context(request)` → calls `getCodeContext` under the hood.
   - [ ] Ensure this tool respects the same FS safety constraints as `read_file`.

4. **Prompt updates**
   - [ ] Update `src/agent/prompts/coder.md`:
     - [ ] document `get_code_context` and when to use it,
     - [ ] explicitly discourage brute‑force `list_files` + `read_file` loops when diagnostics already point to specific files.

5. **Caching & budget interaction**
   - [ ] Track how often `get_code_context` is called vs raw `read_file` in budgets/metrics.
   - [ ] Optionally decrease the budget cost of `get_code_context` relative to equivalent multiple `read_file` calls to encourage its use.

6. **Tests**
   - [ ] Add `test/tools/code_context.test.ts`:
     - [ ] uses a small TS fixture with a few functions/components,
     - [ ] asserts that `getCodeContext({ symbol: 'foo' })` returns snippets from the correct file and line range.
   - [ ] Add `test/agent/coder_context_usage.test.ts`:
     - [ ] uses a mocked LLM to ensure Coder calls `get_code_context` when prompted with diagnostics pointing to a symbol/file.

## Affected files/modules

- `.sdd/architect.md` (Search & Repo Understanding sections)
- `.sdd/best_practices.md` (agent efficiency section)
- `src/agent/utils/code_context.ts` (new)
- `src/agent/nodes/coder.ts`
- `src/agent/prompts/coder.md`
- `test/tools/code_context.test.ts` (new)
- `test/agent/coder_context_usage.test.ts` (new)

## Tests

- `npm test -- test/tools/code_context.test.ts`
- `npm test -- test/agent/coder_context_usage.test.ts`

## Risks & Edge Cases

- Parsing/indexing very large repos could be slow; mitigate by:
  - lazily indexing only when `get_code_context` is called,
  - restricting to a subset of directories (e.g. `src/**/*`).
- Non‑TS stacks (Python, Go, etc.) will initially fall back to plain `read_file`; future tickets can extend the indexer to other languages (tree‑sitter, LSP).

## Dependencies

- Upstream:
  - 19‑performance‑and‑tool‑efficiency‑optimizations
  - 20‑repo‑understanding‑and‑context‑loading
  - 24‑error‑first‑execution‑strategy‑for‑coder‑and‑verifier
- Downstream:
  - 34‑hybrid‑patch‑pipeline‑and‑ast‑fallback
  - 36‑mcp‑code‑tools‑pilot‑integration


