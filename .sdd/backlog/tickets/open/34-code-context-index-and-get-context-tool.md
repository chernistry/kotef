# Ticket: 34 Code context index & get_context tool

Spec version: v1.0  
Context: `.sdd/architect.md` (Agent Layer → repo understanding), `.sdd/best_practices.md` (tool efficiency, error-first), `.sdd/context/arch_refactor.md` (Section 6.5 — Coder re-reading files).

## Context
- Coder currently relies on `list_files` + `read_file` for understanding the repo.
- Even with budgets and policies, the model can waste many turns:
  - scanning large parts of the repo,
  - repeatedly reading the same files before making edits.
- External research suggests adding a **code context retrieval layer**:
  - code index (AST + embeddings),
  - higher-level `get_context` tool that returns only the most relevant code snippets.

## Objective & Definition of Done

Introduce a **code context index** and a `get_context` tool that:
- Indexes the repo (or relevant subsets) using AST-level structure (e.g. ts-morph / tree-sitter) and optionally embeddings.
- Serves focused context snippets (functions, components, modules) to Coder instead of raw file blobs.
- Remembers what has already been read during the run to avoid redundant reads.

DoD:
- New indexing module with a simple, pluggable design (start with TypeScript/JS; extend later).
- A `get_context` tool exposed to Coder that:
  - accepts a query (e.g. filename + symbol + brief description),
  - returns a small set of code blocks with paths and ranges.
- Coder prompt and node updated to prefer `get_context` over brute `read_file` for non-trivial tasks.

## Steps
1. **Design index abstraction**
   - Define a minimal interface, e.g.:
     - `buildIndex(rootDir, cfg): Promise<CodeIndex>`
     - `queryIndex(index, params): Promise<CodeSnippet[]>`
   - `CodeSnippet` should include `path`, `startLine`, `endLine`, and `text`.

2. **Implement initial TypeScript/JS indexer**
   - Use `ts-morph` or similar to:
     - parse project files,
     - record top-level declarations (functions, classes, components, exports).
   - Keep it simple: no need for full dependency graph yet; focus on mapping names to locations.

3. **Implement get_context tool**
   - Add a new tool in `coder`’s tools spec: `get_context(params)`:
     - `params` may include `fileHint`, `symbol`, `goalSnippet`.
   - Implement the handler in the Coder node:
     - ensure index is built once per run (cached in state or a singleton),
     - run `queryIndex` and return a concise JSON payload with matching snippets.

4. **Prompt & policy updates**
   - Update `src/agent/prompts/coder.md` to:
     - document `get_context`,
     - encourage using it before mass `read_file` calls on non-tiny tasks.
   - Adjust coder’s guardrails to:
     - consider repeated `get_context` calls cheaper than repeated raw `read_file` for large files.

5. **Telemetry & tuning hooks**
   - Track `get_context` usage in `AgentState.metrics` and logs, so we can:
     - see how often it’s used,
     - tune index strategies based on real runs.

6. **Tests**
   - Add tests under `test/tools/code_index.test.ts` for index build/query.
   - Add an agent-level test (e.g. in `test/agent/coder_profile.test.ts`) that:
     - simulates a task requiring context,
     - asserts that `get_context` is used (or at least available) and that repeated raw `read_file` calls are reduced.

## Affected files/modules
- `src/tools/code_index.ts` (new; index abstraction + TS/JS implementation).
- `src/agent/nodes/coder.ts` (tool handler).
- `src/agent/prompts/coder.md` (new tool description and policy).
- `src/agent/state.ts` / `src/agent/graph.ts` (if we choose to cache index in state).
- Tests under `test/tools/*` and `test/agent/*`.

## Tests
- `npm test -- test/tools/code_index.test.ts`
- `npm test -- test/agent/coder_profile.test.ts`

## Risks & Edge Cases
- **Indexing cost**:
  - On large monorepos, a full index can be expensive; mitigate via:
    - configurable file globs,
    - incremental or on-demand indexing.
- **Language coverage**:
  - Start with TS/JS; other stacks may be added later or fall back to existing `read_file` behaviour.

## Dependencies
- Independent but synergistic with Tickets 30 (progress controller), 31 (diagnostics log), and 33 (LSP diagnostics).

