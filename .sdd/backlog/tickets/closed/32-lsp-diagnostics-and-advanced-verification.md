# Ticket: 32 LSP Diagnostics & Advanced Verification

Spec version: v1.3  
Context: `.sdd/architect.md` (Verification, Tools Layer), `.sdd/context/arch_refactor.md` (sections 4.5, 5.1, 6.1–6.3), Tickets 17 (goal‑aware verification), 27 (preflight verification), 31 (diagnostics log).  
Dependencies: 17, 27, 30, 31.

## Objective & Definition of Done

Augment the Verifier with **Language Server Protocol (LSP)** diagnostics for TypeScript/JS projects, so that:

- the agent has a cheap, structured signal about compile‑time errors before or alongside tests,
- progress can be measured as **Δ number and severity of LSP diagnostics**,
- Planner/Coder can use LSP results as an early gate and guidance, similar to MarsCode/Serena agents.

### Definition of Done

- [ ] A new tool/module exists for running LSP diagnostics on the repo:
  - [ ] uses `typescript-language-server` (or equivalent) launched as a child process,
  - [ ] can run in a “one‑shot diagnostics” mode (no long‑lived server required for MVP),
  - [ ] returns a structured list of diagnostics (file, range, severity, message).
- [ ] Verifier Node:
  - [ ] optionally invokes LSP diagnostics for TypeScript/JS stacks (detected via `package.json`, `tsconfig.json`, etc.),
  - [ ] merges LSP findings into `diagnosticsLog` with `source: 'lsp'`,
  - [ ] uses LSP as an additional gate for “ready to run tests” decisions where appropriate.
- [ ] Planner:
  - [ ] sees summarized LSP diagnostics and can:
    - [ ] choose to send Coder to fix compile errors before running heavy tests,
    - [ ] avoid redundant test runs when basic typechecking is still broken.
- [ ] Coder:
  - [ ] is explicitly instructed (via prompt) to treat LSP compile errors as top‑priority fixes for TS/JS code.
- [ ] Feature is profile‑aware:
  - [ ] enabled by default in `strict` and `fast`,
  - [ ] optional or skipped in `smoke`/`yolo` to save time.

## Steps

1. **Design LSP adapter**
   - [ ] Investigate `typescript-language-server` invocation model:
     - [ ] whether to use a simple CLI command (e.g. `typescript-language-server --stdio`) with JSON‑RPC messages from Node,
     - [ ] or a wrapper library if one exists.
   - [ ] Create `src/tools/lsp.ts` with a minimal API:

```ts
export interface LspDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export async function runTsLspDiagnostics(rootDir: string): Promise<LspDiagnostic[]> { ... }
```

   - [ ] Ensure the adapter:
     - [ ] respects timeouts,
     - [ ] does not leak absolute paths or sensitive data outside logs.

2. **Stack detection hook**
   - [ ] Extend `detectCommands` or add a helper to decide when LSP makes sense:
     - [ ] presence of `tsconfig.json`, `.ts`/`.tsx` files,
     - [ ] Node/TS project heuristics.

3. **Verifier integration**
   - [ ] In `src/agent/nodes/verifier.ts`:
     - [ ] before or after test commands (depending on profile), call `runTsLspDiagnostics` when stack detection says it’s appropriate,
     - [ ] transform results into `DiagnosticsEntry` entries with `source: 'lsp'`,
     - [ ] include a short count summary (e.g. “3 LSP errors, 2 warnings”) in logs and in the verifier prompt context.

4. **Planner & Coder prompt updates**
   - [ ] Update `src/agent/prompts/planner.md`:
     - [ ] mention that LSP diagnostics may be available,
     - [ ] instruct the model to prioritize fixing compile errors before heavy tests when LSP reports many errors.
   - [ ] Update `src/agent/prompts/coder.md`:
     - [ ] describe how LSP diagnostics are surfaced (e.g. in `diagnosticsLog`),
     - [ ] ask the model to use locations (file + line) to target diffs precisely.

5. **Profile controls & config**
   - [ ] Add a config flag (e.g. `enableLspDiagnostics?: boolean`) to `KotefConfig`, defaulting to `true`.
   - [ ] Make Verifier respect execution profile:
     - [ ] in `strict`: always run LSP when available,
     - [ ] in `fast`: run once per run or when errors change significantly,
     - [ ] in `smoke`/`yolo`: skip by default unless explicitly requested by SDD/ticket.

6. **Tests**
   - [ ] Add `test/tools/lsp_diagnostics.test.ts`:
     - [ ] uses a small TS fixture project with a deliberate type error,
     - [ ] asserts that `runTsLspDiagnostics` returns at least one error with correct file/message.
   - [ ] Add `test/agent/verification_lsp.test.ts`:
     - [ ] mocks LSP results and ensures Verifier writes them into `diagnosticsLog`,
     - [ ] ensures planner/coder prompts receive summarized diagnostics (can be validated via helper or snapshot).

## Affected files/modules

- `.sdd/architect.md` (Verification & Tools Layer sections)
- `src/tools/lsp.ts` (new)
- `src/agent/utils/verification.ts` (stack detection)
- `src/agent/nodes/verifier.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/coder.ts`
- `src/agent/prompts/planner.md`
- `src/agent/prompts/coder.md`
- `src/core/config.ts` (optional `enableLspDiagnostics` flag)
- `test/tools/lsp_diagnostics.test.ts` (new)
- `test/agent/verification_lsp.test.ts` (new)

## Tests

- `npm test -- test/tools/lsp_diagnostics.test.ts`
- `npm test -- test/agent/verification_lsp.test.ts`
- Regression: `npm test -- test/agent/verifier_sanity.test.ts`

## Risks & Edge Cases

- LSP startup overhead may be noticeable on large repos; mitigations:
  - cache results per run,
  - run only once per run or per significant change.
- Misconfigured or missing `tsconfig.json` could cause noisy diagnostics; treat such cases as `runtime` errors with clear messages, and allow Planner to route to Snitch if config is fundamentally broken.
- Security: ensure rootDir is respected and no external network is used by the LSP process.

## Dependencies

- Upstream:
  - 17‑goal‑aware‑verification‑and‑test‑selection
  - 27‑preflight‑verification‑and‑syntax‑sanity‑for‑edits
  - 30‑command‑runner‑and‑package‑manager‑detection
  - 31‑diagnostics‑log‑and‑error‑aware‑planning
- Downstream:
  - 35‑supervisor‑level‑progress‑controller‑and‑stuck‑handler


