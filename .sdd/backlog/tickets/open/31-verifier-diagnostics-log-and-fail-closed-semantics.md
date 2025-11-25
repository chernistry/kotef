# Ticket: 31 Verifier diagnostics log & fail-closed semantics

Spec version: v1.0  
Context: `.sdd/architect.md` (Sections 3, 6 — verification & quality), `.sdd/best_practices.md` (error-first, goal-first DoD), `.sdd/context/arch_refactor.md` (Section 6.2 — Verifier API), Tickets 17, 24, 27, 28, 29.

## Context
- Verifier currently:
  - auto-detects commands via `detectCommands`,
  - runs a profile-aware subset (`strict` vs `fast` vs `smoke`/`yolo`),
  - records `functionalChecks`, `failureHistory`, `sameErrorCount`, and uses an LLM with `verifier.md` for goal-first DoD (`done_success` vs `done_partial`).
- Missing pieces highlighted in `arch_refactor.md`:
  - no **explicit diagnostics log** with structured errors (file, position, summary),
  - Verifier can fail “open” (internal issues degrade checks instead of blocking),
  - Coder and planner prompts don’t consume a canonical “top N errors” summary.

## Objective & Definition of Done

Upgrade Verifier to a **fail-closed**, diagnostics-first gate that:
- Emits a structured **diagnostics log** into `AgentState` (not just raw `testResults` / `failureHistory`).
- Treats any internal verifier error as **blocking** by default (`status: "failed"` or `"blocked"`, `next: "planner"`).
- Feeds a concise “top N errors” view into planner/coder prompts to drive error-first fixing.

DoD:
- New `diagnosticsLog` structure in `AgentState` with:
  - list of errors (file, code, message, severity, origin: `test`/`lint`/`build`/`runtime`),
  - a compact summary of primary cause(s).
- Verifier always returns a **valid JSON decision**; any internal error yields a conservative “fail/blocked” outcome and never silently passes.
- Planner/coder prompts and nodes are updated to include the diagnostics summary in their context, and tests cover the new contracts.

## Steps
1. **Design diagnostics log schema**
   - Add a type in `src/agent/state.ts`, e.g.:
     - `DiagnosticsEntry` with fields: `source`, `command`, `file?`, `position?`, `code?`, `message`, `severity`, `timestamp`.
   - Add `diagnosticsLog?: DiagnosticsEntry[]` and `diagnosticsSummary?: string` to `AgentState`.
   - Document how this log is populated and consumed in `.sdd/architect.md` (Agent Layer → Verifier).

2. **Extract diagnostics from test runner**
   - Extend `src/tools/test_runner.ts` so that `runCommand` can optionally:
     - return parsed diagnostics (e.g. via regex for Jest/Vitest/TS errors, starting minimal),
     - classify each line into `DiagnosticsEntry` where possible.
   - Keep classification conservative and simple initially (e.g. only support common Node/TS patterns).

3. **Wire diagnostics into Verifier**
   - In `src/agent/nodes/verifier.ts`:
     - after each command run, map `TestRunResult` into zero or more `DiagnosticsEntry`s.
     - append these entries to `state.diagnosticsLog`.
     - build a short `diagnosticsSummary` string (e.g. top 3 distinct errors by command/file).
   - Ensure that `deriveFunctionalStatus` and `failureHistory` remain intact but can use `diagnosticsLog` in the future.

4. **Fail-closed semantics**
   - Harden the Verifier’s LLM call:
     - Wrap JSON parsing with a strict fallback: if parsing fails or LLM errors, build a default decision:
       - `status: "failed"` if any command failed, else `"blocked"`.
       - `next: "planner"`.
       - `summary` referencing `diagnosticsSummary` or at least command failures.
     - Log internal verifier issues clearly.
   - Ensure that **no path** can lead to `done` when:
     - commands failed and `executionProfile === "strict"`, or
     - `diagnosticsLog` contains critical errors (configurable later).

5. **Expose diagnostics to planner & coder**
   - Update `plannerNode` to include `diagnosticsSummary` (and possibly a truncated `diagnosticsLog`) in its system prompt replacements.
   - Update `coder` prompt and node:
     - add a “Diagnostics” section in the prompt input (`{{DIAGNOSTICS}}`),
     - encourage focusing on the top errors first and not wandering off into unrelated files.

6. **Tests**
   - Add unit tests for:
     - `test/tools/test_runner_diagnostics.test.ts` — verify diagnostics extraction for representative error outputs.
   - Extend `test/agent/verifier_sanity.test.ts` and/or `test/agent/verification_policy.test.ts` to:
     - assert that internal LLM/parse failures produce a fail-closed decision,
     - assert that `diagnosticsLog` and `diagnosticsSummary` are populated and passed through state.

## Affected files/modules
- `src/agent/state.ts` — new diagnostics structures.
- `src/tools/test_runner.ts` — diagnostics extraction.
- `src/agent/nodes/verifier.ts` — wiring, fail-closed behaviour.
- `src/agent/nodes/planner.ts` — prompt context updates.
- `src/agent/nodes/coder.ts` and `src/agent/prompts/coder.md` — consume diagnostics.
- Tests under `test/agent/*` and `test/tools/*`.

## Tests
- `npm test -- test/tools/test_runner_diagnostics.test.ts`
- `npm test -- test/agent/verifier_sanity.test.ts`
- `npm test -- test/agent/verification_policy.test.ts`

## Risks & Edge Cases
- **Overly aggressive blocking**:
  - If diagnostics parsing is too naive, we may incorrectly consider non-critical warnings as blockers; mitigate by starting with “errors only”.
- **Noise explosion**:
  - Raw test output can be huge; mitigated by summarising and truncating logs, and only storing actionable entries.
- **Model overfitting to diagnostics phrasing**:
  - Changes in test output formats may break parsing; keep patterns modular and tested.

## Dependencies
- Builds on: Tickets 17, 24, 27, 28, 29 (goal-aware verification, error-first strategy, functional probes, prompt hardening).
- Upstream for: Ticket 30 (supervisor progress controller) and Ticket 34 (LSP diagnostics integration), which will use `diagnosticsLog` as a richer signal.

