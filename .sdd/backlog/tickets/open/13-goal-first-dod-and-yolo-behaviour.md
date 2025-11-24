# Ticket: 13 Goal‑First DoD & `yolo` Behaviour

Spec version: v1.1  
Context: `.sdd/project.md` (Definition of Done), `.sdd/architect.md` (Goals & Non‑Goals, Quality Gates, Stop Rules, Execution Profiles), `.sdd/best_practices.md` (DX & cost guardrails), runtime in `src/agent/nodes/{planner, coder, verifier, snitch}.ts`.  
Dependencies: 10 (profiles), 11 (failure feedback); builds on existing DoD.

## Objective & DoD

Make kotef’s behaviour more **goal‑oriented and pragmatic**, especially in `fast` / `yolo` profiles:

- For small/medium tasks, the agent should **prefer delivering working functionality** over chasing perfect coverage/linters forever.
- There should be clear, documented conditions for:
  - When we consider the goal “functionally satisfied”.
  - When we accept “partial success” and stop.
  - When we refuse / escalate due to SDD constraints.

**Definition of Done**

- [ ] `.sdd/architect.md` is updated with a “Goal‑First DoD & Profiles” section that:
  - [ ] Distinguishes **functional success** from **quality hardening**.
  - [ ] Specifies, per profile (`strict`, `fast`, `smoke`, `yolo`), which gates are **hard** vs **soft**:
    - [ ] `strict`: hard gates for tests, type-checking, and linters (current behaviour).
    - [ ] `fast`: hard gate on core functional tests, soft on full coverage / secondary linters.
    - [ ] `smoke`: minimal functional checks only, everything else advisory.
    - [ ] `yolo`: functionally‑first; tests and linters are best-effort and bounded.
- [ ] `plannerNode` and `verifierNode` respect these semantics:
  - [ ] In `fast` / `yolo`, they can set `done=true` even if some non-critical tests/linters are failing, as long as:
    - [ ] Core functionality works.
    - [ ] We’ve hit an attempt/time budget.
  - [ ] They must document this decision in `plan.reason` and in the run report.
- [ ] When `yolo` is active, planner/coder:
  - [ ] Limit themselves to a small number of fix cycles (e.g. 2–3) after the app is functionally running.
  - [ ] Prefer to return a summary of remaining issues instead of chasing them.

## Implementation Sketch

```md
<!-- .sdd/architect.md, new section -->
### Goal‑First DoD by Profile

- strict: All quality gates (tests, coverage ≥90%, type-check, linters, security checks) are hard requirements.
- fast: Core tests must pass; coverage/linters are best-effort. If core tests pass and no critical errors remain after N attempts, agent may stop.
- smoke: Only minimal smoke test (or manual instructions) required; no hard coverage or lint gates.
- yolo: Primary goal is functional behaviour. If the app runs and core interactions work, agent stops after bounded attempts even if some tests/linters keep failing; remaining issues are documented.
```

```ts
// src/agent/nodes/verifier.ts (pseudo)
const profile = state.runProfile ?? 'fast';
const testsPassed = result.passed;
const functionalOk = inferFunctionalStatus(state); // e.g., based on prior run_command results ("flet run", "npm start") or explicit checks

if (profile === 'yolo' || profile === 'fast') {
  if (functionalOk && !testsPassed && history.attempts >= MAX_ATTEMPTS_GOAL_FIRST) {
    return { testResults: result, done: true }; // mark as "functionally done"
  }
}
```

## Steps

1. **Refine DoD in SDD**
   - [ ] Update `.sdd/architect.md` to:
     - [ ] Introduce the “Goal‑First DoD by Profile” section.
     - [ ] Clarify that DoD is profile-sensitive and explicitly allows partial quality in non‑strict profiles.
   - [ ] Ensure `.sdd/project.md` still states overall quality targets (coverage, etc.) but notes that they may be reached incrementally.

2. **Extend planner to use goal‑first semantics**
   - [ ] Update `src/agent/prompts/planner.md`:
     - [ ] Describe how to decide `next` when core functionality is achieved but some gates fail.
     - [ ] Encourage `next="done"` in `fast` / `yolo` when:
       - [ ] Functional goal is satisfied.
       - [ ] `failureHistory.attempts >= MAX_GOAL_FIRST_ATTEMPTS` and remaining failures are non-critical.
   - [ ] Implement the corresponding logic in `plannerNode`:
     - [ ] Add a small helper to inspect `testResults` and `failureHistory` and determine whether remaining failures are “non‑critical” (lint/coverage) vs “critical” (crashing tests, security).

3. **Teach verifier about functional success**
   - [ ] Add a simple mechanism to track “functional probes”:
     - [ ] Whenever coder runs commands like `flet run app.py`, `npm start`, `python app.py`, record their exit codes in state (e.g. `functionalChecks`).
   - [ ] In `verifierNode`, derive a boolean `functionalOk` from these checks.
   - [ ] Use `functionalOk`, `testsPassed`, `profile`, and `failureHistory.attempts` to decide `done`:
     - [ ] `strict`: `done = testsPassed`.
     - [ ] `fast` / `yolo`: if `functionalOk` and attempts exceed limit, set `done=true` even if tests are still red; record reason.
     - [ ] `smoke`: `done` can be true after a single successful functional check or after first bounded attempt.

4. **Surface decisions to the user**
   - [ ] Ensure `writeRunReport` includes:
     - [ ] Profile used.
     - [ ] Whether we stopped as “functionally done with remaining issues”.
     - [ ] A short list of remaining failing commands/tests, if any.

5. **Tests**
   - [ ] Add `test/agent/goal_first_dod.test.ts` with scenarios:
     - [ ] A small project where tests intentionally remain red due to lint/coverage, but functional run passes:
       - [ ] In `strict`, agent keeps trying until bounded and ends as partial/snitch.
       - [ ] In `yolo`, agent stops after a few attempts and marks run as `done` with a “functional + remaining issues” note.

## Affected Files / Modules

- `.sdd/architect.md` (DoD and profiles update)
- `.sdd/project.md` (optional clarification)
- `src/agent/nodes/planner.ts`
- `src/agent/prompts/planner.md`
- `src/agent/nodes/verifier.ts`
- `src/agent/run_report.ts`
- `test/agent/goal_first_dod.test.ts` (new)

## Tests

```bash
npm test -- test/agent/goal_first_dod.test.ts
```

## Risks & Edge Cases

- Too permissive “goal‑first” logic could mark runs as done when there are still serious issues. Mitigation: keep “critical vs non‑critical” classification conservative.
- Different projects may have different ideas of what “functional success” means; mitigation: keep the initial heuristic simple and allow future SDD tweaks to refine it.

## Non‑Goals / Pitfalls to Avoid

- Do **not** remove the ability to run full strict pipelines; this ticket is about better defaults and bounded effort, not lowering quality across the board.
- Do **not** attempt to automatically mark issues as “critical” vs “non‑critical” using complex static analysis; simple heuristics based on command/test names are enough for now.

