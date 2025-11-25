# Ticket: 37 Task Scope and Error‑First Diagnostics for Greenfield Goals

Spec version: v1.0  
Context: `.sdd/architect.md` (execution profiles, stop rules), `.sdd/best_practices.md` (§1 TL;DR, §3 Agent Orchestration, §4 Error‑First Loops), run log `logs/run.log` (React/Vite portfolio run with `taskScope: "tiny"` and skipped diagnostics), runtime code in `src/agent/task_scope.ts`, `src/agent/nodes/{coder.ts,verifier.ts}`, `src/agent/utils/verification.ts`.

## Objective & DoD

Ensure that **greenfield / “build a new app” goals** are classified as at least `normal` scope so that:

- the **error‑first strategy actually runs** a diagnostic command instead of being skipped by tiny‑task heuristics, and  
- small typo/doc tickets remain cheap (`tiny`) without penalising real feature work.

### Definition of Done

- [ ] `estimateTaskScope`:
  - [ ] Correctly classifies goals like “создай простое портфолио‑сайт на React/Vite” as `normal` (or `large`) even when they are short in words.
  - [ ] Uses **semantic signals** (greenfield / new app / multi‑page features) in addition to word count.
  - [ ] Still returns `tiny` for clear micro‑tasks (typos, README tweaks, comment‑only edits).
- [ ] Coder node:
  - [ ] Treats `taskScope: "normal" | "large"` goals as eligible for `run_diagnostic` in the first turn (aligned with Ticket 24).
  - [ ] Keeps the tiny‑task guardrail so that trivial tickets are not forced to run `npm test`/`npm run build`.
- [ ] Verifier node:
  - [ ] Continues to use detection from `detectCommands` and runs at least one meaningful verification command for such greenfield runs.
- [ ] Regression on the React/Vite portfolio scenario:
  - [ ] For the same goal used in `logs/run.log`, `taskScope` is **no longer `tiny`**.
  - [ ] Coder’s first non‑trivial action either runs `run_diagnostic` or uses existing diagnostics (if already present), instead of only listing/reading files.

## Steps

1. **Scope heuristic audit**
   - [ ] Review `src/agent/task_scope.ts` and document current heuristics (word count, heavy keywords, architect length).
   - [ ] Identify cases where short, but **semantically large**, goals are being marked as `tiny`.
2. **Heuristic redesign**
   - [ ] Introduce explicit **project‑creation signals** (e.g. “create new app”, “portfolio site”, “bootstrap project”, Russian equivalents like “создай”, “портфолио‑сайт”).
   - [ ] Introduce explicit **tiny‑change signals** (typo, README, comment‑only, formatting).
   - [ ] Re‑implement `estimateTaskScope` to:
     - [ ] Prefer semantic signals first (greenfield vs tiny tweaks),
     - [ ] Use word count and architect length only as secondary hints.
3. **Coder/verifier alignment**
   - [ ] Re‑verify coder’s tiny‑task skip behaviour:
     - [ ] Confirm that only `taskScope === "tiny"` can skip diagnostics under non‑strict profiles.
   - [ ] Confirm verifier still behaves correctly for `normal`/`large` scopes (build/test/lint selection is unchanged but now triggers for greenfield tasks).
4. **Scenario validation**
   - [ ] Add or update a small scenario test for a React/Vite portfolio goal:
     - [ ] Assert `estimateTaskScope(goal)` returns `normal` or `large`.
     - [ ] Assert that the first coder turn uses `run_diagnostic` (mocked) rather than only `list_files`/`read_file`.
   - [ ] Optionally, add a tiny‑task scenario (“fix typo in README”) to confirm we still classify as `tiny` and skip heavy diagnostics.

## Affected Files

- `src/agent/task_scope.ts`
- `src/agent/nodes/coder.ts` (tiny‑task diagnostic guard)
- `src/agent/nodes/verifier.ts` (indirectly, via taskScope‑driven policies)
- `test/agent/task_scope.test.ts` (new)  
- `test/agent/coder_error_first_strategy.test.ts` (extend or create)

## Tests

- [ ] Unit tests:
  - [ ] `estimateTaskScope`:
    - [ ] Greenfield React/Vite goal → `normal` or `large`.
    - [ ] “Fix typo in README.md” → `tiny`.
    - [ ] Architecture/infra goal → `large`.
- [ ] Behavioural tests (with mocked LLM & tools):
  - [ ] Greenfield goal: first coder tool call is `run_diagnostic` (or equivalent).
  - [ ] Tiny goal: coder does not run heavy commands under `fast`/`smoke` profiles.

## Risks & Edge Cases

- Over‑classifying too many tasks as non‑tiny may increase diagnostic cost (extra `npm run build` / `npm test` runs). Mitigation: keep tiny‑signals strict and conservative.
- Under‑classifying architecture tickets as `normal` could still happen if the architect text is very short; these can be caught by Ticket 14/30 (stop rules) but should be monitored.

## Dependencies

- Relies on prior work from:
  - Ticket 24 (error‑first strategy),
  - Ticket 19 (budget/command limits),
  - Ticket 14/30 (flow stop rules and progress controller) for safety if diagnostics still fail repeatedly.

