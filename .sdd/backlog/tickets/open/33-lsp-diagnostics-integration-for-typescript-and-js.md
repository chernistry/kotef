# Ticket: 33 LSP diagnostics integration for TypeScript/JS

Spec version: v1.0  
Context: `.sdd/architect.md` (verification / quality gates), `.sdd/best_practices.md` (error-first, strong typing), `.sdd/context/arch_refactor.md` (Section 4.5, MarsCode / LSP patterns).

## Context
- Current diagnostics rely primarily on:
  - build/test commands (e.g. `npm test`, `npm run build`),
  - simple failure classification in `test_runner`.
- External research emphasises **LSP-based diagnostics** as a high-signal progress metric:
  - MarsCode / Serena run LSP diagnostics before and after edits,
  - use changes in error counts/types as a key progress measure.
- Kotef targets Node.js / TypeScript repos heavily; integrating TypeScript LSP is a natural step.

## Objective & Definition of Done

Add an optional **TypeScript/JavaScript LSP diagnostics path** that:
- Runs a TypeScript language server (`typescript-language-server` or `tsserver`) as a separate process.
- Queries diagnostics for the project or specific files touched by the agent.
- Converts LSP diagnostics into our `diagnosticsLog` format and feeds them into Verifier and progress metrics.

DoD:
- A small LSP client module that can:
  - start/stop a TS LSP server process (respecting `KotefConfig` and budgets),
  - request diagnostics for the project or a set of files,
  - return a structured set of diagnostics.
- Verifier optionally invokes LSP diagnostics (especially in `strict` profile) and merges them into `diagnosticsLog`.

## Steps
1. **Design LSP integration boundary**
   - Decide whether to:
     - talk directly to `typescript-language-server` via stdio (JSON-RPC), or
     - use a small off-the-shelf client abstraction.
   - Define `LspDiagnostic` type and map it onto `DiagnosticsEntry`.

2. **Implement LSP client module**
   - Add `src/tools/ts_lsp_client.ts` with functions:
     - `startServer(cfg: KotefConfig): Promise<LspClientHandle>`
     - `getDiagnostics(handle, files?: string[]): Promise<LspDiagnostic[]>`
     - `stopServer(handle): Promise<void>`
   - Honour timeouts and command budgets; reuse the CommandRunner abstraction where feasible.

3. **Integrate with verifier**
   - In `verifierNode`:
     - when `executionProfile === "strict"` (and optionally `fast`), after running tests/builds:
       - call LSP diagnostics for changed files (or project root as fallback),
       - merge results into `diagnosticsLog`.
     - ensure we do not exceed time budgets; allow disabling LSP diagnostics via config for large repos.

4. **Progress metrics hooks**
   - Expose a simple metric like `tsErrorsCount` in derived snapshots (see Ticket 30).
   - Use it as a key signal for “progress vs stuck” in `ProgressSnapshot`.

5. **Config & docs**
   - Add flags in `KotefConfig` / `.sdd/architect.md`:
     - `enableTsLspDiagnostics` (default off for now, to be safe),
     - optional timeout / max files per run.
   - Document trade-offs (better diagnostics vs extra cost/latency).

6. **Tests**
   - Add tests under `test/tools/ts_lsp_client.test.ts` that:
     - mock LSP server or use a small fixture repo to ensure we can start/stop and parse diagnostics.
   - Extend `test/agent/functional_probes.test.ts` or add a new test to validate that LSP diagnostics contribute to `diagnosticsLog`.

## Affected files/modules
- `src/tools/ts_lsp_client.ts` (new).
- `src/agent/nodes/verifier.ts` (integration).
- `src/agent/state.ts` (`diagnosticsLog` / metrics extensions).
- `src/core/config.ts` (flags).
- Tests under `test/tools/*` and `test/agent/*`.

## Tests
- `npm test -- test/tools/ts_lsp_client.test.ts`
- `npm test -- test/agent/functional_probes.test.ts`

## Risks & Edge Cases
- **Performance**:
  - LSP startup can be slow on large repos; mitigate via caching, optional usage, and strict timeouts.
- **Complexity**:
  - JSON-RPC and LSP protocol handling can be tricky; keep our client minimal and well-tested.
- **Environment quirks**:
  - Some projects might have custom TS configs or require build steps before diagnostics; handle failures gracefully and do not replace build/tests entirely.

## Dependencies
- Depends on: Ticket 32 (Command runner upgrade) for robust process management.
- Feeds into: Ticket 30 (progress controller), Ticket 31 (diagnostics log), and future eval work that uses LSP error deltas as a quality signal.

