# Ticket: 30 Supervisor progress controller & stuck handler

Spec version: v1.0  
Context: `.sdd/architect.md` (Sections 3–6, especially metric profile and LangGraph orchestration), `.sdd/best_practices.md` (loop bounds, safety), `.sdd/context/arch_refactor.md` (Section 6 — solutions for looping).

## Context
- Current graph: `planner → researcher → coder → verifier` with budgets, `loopCounters`, `failureHistory`, `functionalChecks`, and `terminalStatus`.
- Tickets 11, 14, 19, 24, 25, 28, 29 added basic stop rules, loop counters, error-first strategy, and functional probes.
- External research (`arch_refactor.md`) recommends a more explicit **progress controller** that tracks repeated states and hard-stops “stuck” runs, similar to SWE-agent / MarsCode-style agents (state fingerprints + penalties for non-progress).

## Objective & Definition of Done

Introduce a **supervisor-level progress controller** on top of the existing LangGraph that:
- Detects lack of progress using **state fingerprints** (node + files + diagnostics) instead of only hop counters.
- Provides a dedicated **StuckHandler** outcome that:
  - either changes strategy (e.g. suggests broader edits / new research angle),
  - or terminates with a clear `terminalStatus: "aborted_stuck"` and an actionable report.
- Keeps behaviour aligned with metric profile:
  - reduces runaway loops (SecRisk/Cost),
  - improves debuggability (Maintainability/DX),
  - does **not** introduce brittle heuristics that would prematurely stop valid long-running tasks.

DoD:
- A small, well-documented **progress controller** module with unit tests.
- Planner / graph integration that:
  - enforces a **global MAX_STEPS**, and
  - aborts or routes to a “stuck” outcome when state repeats K times without progress.
- Clear logging & run-report entries when a run is aborted as stuck.

## Steps
1. **Design progress model**
   - Define a `ProgressSnapshot` structure (e.g. `{ node, fileChangeCount, lastDiagnosticsHash, sameErrorCount, budgetUsed }`).
   - Decide what constitutes “no progress” over time (e.g. unchanged `ProgressSnapshot` for K steps, or monotonic non-improvement in error/test metrics).
   - Document this as a short ADR-style note linked from `.sdd/architect.md` (Component: Agent Layer, Flow Control).

2. **Implement progress controller utility**
   - Add `src/agent/utils/progress_controller.ts` (or similar) that exposes:
     - `makeSnapshot(state: AgentState): ProgressSnapshot`
     - `assessProgress(history: ProgressSnapshot[]): { status: "ok" | "stuck_candidate"; reason: string }`
   - Use existing state fields (`loopCounters`, `sameErrorCount`, `lastTestSignature`, `fileChanges`, `functionalChecks`, `budget`) to build the snapshot; avoid duplicating data.
   - Ensure the utility is pure and testable (no I/O or logging inside).

3. **Integrate with LangGraph state & planner**
   - Extend `AgentState` with a minimal `progressHistory` slice (bounded length).
   - In the main graph driver (e.g. `src/agent/graph.ts` or entrypoint loop), after each node hop:
     - compute a new `ProgressSnapshot`,
     - append to `progressHistory` (trimming to last N entries),
     - call `assessProgress`.
   - When `assessProgress` returns `"stuck_candidate"` or when `totalSteps > MAX_STEPS_SUPERVISOR`:
     - set `terminalStatus: "aborted_stuck"`,
     - attach a short, human-readable explanation to the run report,
     - route to a final “stuck” exit path instead of cycling through planner again.

4. **Optional: StuckHandler node**
   - If we keep this inside the graph (not just a wrapper around it), add a lightweight `StuckHandler` node:
     - It receives the current `AgentState` and `progressHistory`.
     - It can suggest one of:
       - “escalate to human” (snitch-style issue),
       - “switch profile” (e.g. from `fast` to `strict` or `smoke`),
       - “widen scope” (only if allowed by `.sdd/architect.md` + profile),
       - “abort with explanation”.
   - Wire the planner so that when it sees `terminalStatus: "aborted_stuck"`, it does not try to re-plan but just records the outcome.

5. **Logging & run reports**
   - Extend logging in `src/core/logger.ts` / agent nodes so that:
     - when a stuck condition is detected, logs include:
       - last few `ProgressSnapshot`s,
       - key test/diagnostic commands and their outputs (or references to run-report sections).
   - Ensure `.sdd/runs/*` reports include a short “Why we stopped” paragraph when `terminalStatus` is `aborted_stuck`.

6. **Tests**
   - Add tests under `test/agent/progress_controller.test.ts` (or similar) that:
     - feed synthetic `AgentState` sequences to `makeSnapshot`/`assessProgress`,
     - verify that repeated, non-improving states trigger `"stuck_candidate"`.
   - Add an integration-style test in `test/agent/flow_stop_rules.test.ts` (or a new file) that:
     - simulates a run with repeated failures,
     - asserts that the graph terminates with `terminalStatus: "aborted_stuck"` and does not loop indefinitely.

## Affected files/modules
- `src/agent/state.ts` (add `progressHistory` if needed; ensure types are up to date).
- `src/agent/graph.ts` (or graph orchestrator) — integrate progress controller after each hop.
- `src/agent/utils/progress_controller.ts` (new).
- `src/core/logger.ts` and/or run-report handling (for stuck reporting).
- Existing tests under `test/agent/*` that rely on terminal statuses or flow stop rules.

## Tests
- `npm test -- test/agent/flow_stop_rules.test.ts`
- `npm test -- test/agent/progress_controller.test.ts`
- Optionally: a small scenario under `test/scenarios/` that purposely cannot succeed (e.g. missing dependency), to validate “stuck” behaviour end-to-end.

## Risks & Edge Cases
- **False positives** (declaring “stuck” while real progress is still possible):
  - Mitigation: start with conservative thresholds (higher `MAX_STEPS`, larger K for repeated states) and tune via eval runs.
- **State bloat**:
  - Keeping full snapshots in history could grow memory usage; mitigate by storing only hashes / small structs and bounding history length.
- **Over-coupling to current implementation**:
  - If `ProgressSnapshot` depends too much on current fields, future refactors may break it; mitigate by centralising snapshot construction in one utility with tests.

## Dependencies
- Builds on: Tickets 11, 14, 19, 24, 25, 28, 29 (loop counters, budgets, functional probes, prompt policies), which are already closed.
- Upstream for future work:
  - Ticket 31 (Verifier diagnostics & fail-closed) and 34 (LSP diagnostics integration) will provide richer signals for `ProgressSnapshot`.
  - Ticket 35 (Code context index) can add “files touched vs. context used” metrics later.

