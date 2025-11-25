# Ticket: 28 Functional Probes & Goal‑First Verification v2

Spec version: v1.3  
Context: `.sdd/project.md` (Definition of Done), `.sdd/architect.md` (Goal‑First DoD, profiles), `.sdd/best_practices.md` (DX & cost guardrails), closed Ticket 13 (`goal-first-dod-and-yolo-behaviour`), runtime logs in `logs/run.log` (integration goal where `npm test` passed but `npm run dev` showed Prisma + Vite errors), runtime nodes `src/agent/nodes/{planner.ts,verifier.ts,coder.ts}`, state `src/agent/state.ts`.  
Dependencies: 10 (profiles), 11 (failure feedback loop), 19 (budgets), 24 (error-first diagnostics), 25 (loop detection).

## Objective & DoD

Close the remaining gap between the **Goal‑First DoD spec** and actual runtime behaviour:

- Treat **“the app actually runs without obvious errors”** as a first‑class signal (`functionalOk`), not just “tests are green”.
- Use that signal to make **profile-aware stop decisions** (especially `fast`/`yolo`) without:
  - hiding real crashes (Prisma/Vite errors in dev output),
  - or looping forever on non‑critical checks (lint/coverage).

### Definition of Done

- [ ] A `functionalChecks` channel is added to `AgentState` and populated whenever the agent runs candidate “app run” or smoke commands (e.g. `npm run dev`, `npm start`, `python app.py`, `flet run`, `go run .`):
  - [ ] Each entry captures: `{ command, exitCode, timestamp, node: 'coder' | 'verifier', stdoutSample, stderrSample }`.
- [ ] `verifierNode` derives a boolean `functionalOk` from `functionalChecks`:
  - [ ] `functionalOk === true` only when at least one recent probe (configurable window, e.g. last 3) **exits 0** and does not contain obvious crash markers in stderr.
  - [ ] `functionalOk === false` if all probes fail or no probes were executed.
- [ ] **Goal‑First stop logic** is implemented and documented:
  - [ ] In `strict` profile:
    - [ ] `done_success` still requires all configured verification gates (tests + syntax check + lint as currently defined).
    - [ ] `functionalOk` is treated as advisory (extra context), never sufficient to mark `done`.
  - [ ] In `fast` profile:
    - [ ] Planner/verifier may set `terminalStatus = 'done_partial'` and `next='done'` when:
      - [ ] `functionalOk === true`,
      - [ ] all **critical** commands (compile / primary tests) have been attempted at least N times (e.g. N=2),
      - [ ] remaining failures are tagged as **non‑critical** (lint/coverage).
  - [ ] In `smoke` / `yolo` profiles:
    - [ ] If `functionalOk === true` and loop/budget limits are hit, planner can stop with `done_partial` even if some tests/linters still fail, with a clear list of remaining issues.
- [ ] The planner prompt (`src/agent/prompts/planner.md`) and verifier prompt (`src/agent/prompts/verifier.md` if present, otherwise its system prompt in code) are updated to:
  - [ ] Explicitly reference `functionalChecks` / `functionalOk` and describe how profiles should trade off functional success vs quality gates.
  - [ ] Make the “functionally done with remaining issues” path explicit and JSON‑encoded (so run reports can surface it).
- [ ] Run reports (`src/agent/run_report.ts`) show:
  - [ ] A **Functional Probes** section summarising which commands were treated as functional probes and whether they passed.
  - [ ] When a run is stopped due to goal‑first logic, the report clearly states: “Stopped as functionally done with remaining issues” and lists remaining failing commands.

## Implementation Sketch

### 1. Represent functional probes in state

- Extend `AgentState` in `src/agent/state.ts`:

```ts
export interface FunctionalCheck {
  command: string;
  exitCode: number;
  timestamp: number;
  node: 'coder' | 'verifier';
  stdoutSample?: string;
  stderrSample?: string;
}

export interface AgentState {
  // ...
  functionalChecks?: FunctionalCheck[];
}
```

- Add a `functionalChecks` channel in `src/agent/graph.ts` with reducer `concat` and default `[]`.

### 2. Capture functional probes in coder/verifier

- In `src/agent/nodes/coder.ts`:
  - After `runCommand(cfg, commandStr)`, add a helper `recordFunctionalProbe(state, commandStr, cmdResult, 'coder')` that:
    - uses the existing `detectedCommands.smokeTest` and simple regexes to flag probable “run app” commands (`dev`, `start`, `flet run`, `python app.py`, etc.),
    - appends an entry into `functionalChecks` only when the command looks like a functional probe (not `npm test`, `npm run lint`, etc.).

- In `src/agent/nodes/verifier.ts`:
  - When running verification commands, call the same helper with node `'verifier'` for any command that matches `detected.smokeTest` or obvious “app run” shapes.

### 3. Derive `functionalOk` in verifier

- In `verifierNode`:

```ts
const recentChecks = (state.functionalChecks || []).slice(-3);
const functionalOk = recentChecks.some(c => c.exitCode === 0);
```

- Optionally, filter out checks where stderr contains known crash patterns (`Traceback`, `PrismaClientConstructorValidationError`, `SyntaxError`, etc.).

- Surface `functionalOk` into the verifier LLM prompt replacements so the LLM can reason about “functional but still flaky tests” vs “crashing app”.

### 4. Goal‑First stop logic in planner

- In `src/agent/nodes/planner.ts`, near the budget and loop checks:
  - Derive `functionalOk` from state as above (or trust a boolean set by verifier).
  - When budgets are near exhaustion and `functionalOk === true`:
    - In `fast` / `yolo`, allow planner to short‑circuit with:

```ts
return {
  terminalStatus: 'done_partial',
  plan: {
    next: 'done',
    reason: 'Functional goal appears satisfied; remaining failures are non-critical tests/linters under profile ${state.runProfile}.',
    profile: state.runProfile,
    plan: []
  },
  done: true
};
```

  - Keep `strict` behaviour unchanged (no early exit on functionalOk alone).

### 5. Reporting and observability

- In `src/agent/run_report.ts`:
  - Add a `## Functional Probes` section when `state.functionalChecks` exists, e.g.:

```md
## Functional Probes
- npm run dev → exit 1 (PrismaClientConstructorValidationError...)
- npm start → exit 0
```

  - When `terminalStatus` is `done_partial` and goal‑first logic was used, mention this explicitly in the **Status** section.

## Steps

1. **State & channels**
   - [ ] Add `FunctionalCheck` type and `functionalChecks` to `AgentState`.
   - [ ] Wire `functionalChecks` channel into `buildKotefGraph`.
2. **Instrumentation**
   - [ ] Implement `recordFunctionalProbe` helper in a small shared util (e.g. `src/agent/utils/functional_checks.ts`).
   - [ ] Call it from coder and verifier when commands match functional probe heuristics.
3. **Verifier logic**
   - [ ] Compute `functionalOk` and include it in verifier prompts and decisions.
4. **Planner goal‑first logic**
   - [ ] Use `functionalOk` + budgets + profile to decide when to stop as “functionally done with remaining issues”.
5. **Reporting**
   - [ ] Extend run reports with a “Functional Probes” section and explicit goal‑first stop reason.
6. **Docs & prompts**
   - [ ] Update `.sdd/architect.md` “Goal‑First DoD & Profiles” section to mention `functionalOk` and functional probes.
   - [ ] Update planner/verifier prompts to reflect the new semantics.

## Affected Files / Modules

- `.sdd/architect.md` (Goal‑First DoD section)
- `src/agent/state.ts`
- `src/agent/graph.ts`
- `src/agent/utils/functional_checks.ts` (new)
- `src/agent/nodes/{coder.ts,verifier.ts,planner.ts}`
- `src/agent/run_report.ts`
- `src/agent/prompts/planner.md`
- `src/agent/prompts/verifier.md` (if/when extracted)
- Tests: `test/agent/goal_first_dod.test.ts` (extended), new `test/agent/functional_probes.test.ts`.

## Tests

- Unit:
  - `goal_first_dod.test.ts`: scenarios where tests fail but functional probes succeed; assert `done_partial` in `fast`/`yolo` and not in `strict`.
  - `functional_probes.test.ts`: ensure `functionalChecks` are recorded only for intended commands and that `functionalOk` is computed correctly.
- Integration:
  - Reproduce the dummy app scenario from `logs/run.log`:
    - Ensure the agent surfaces Prisma/Vite errors as failing functional probes.
    - Verify that in `fast`/`yolo`, after fixes, the agent can stop once `npm run dev` is clean even if some lint checks remain.

## Risks & Trade‑offs

- **SecRisk (0.25)**: Low impact; we are only *recording* more command metadata. Must ensure we never log sensitive env vars from commands.
- **Maintainability (0.20)**: Slightly more state and plumbing, but behaviour becomes easier to reason about (functional vs non‑functional).
- **DevTime (0.20)**: Medium; touches several core nodes and tests, but changes are localized.
- **PerfGain (0.15)**: Moderate; fewer pointless fix loops once the app is already running.
- **Cost (0.10)**: Neutral to slightly positive; fewer redundant LLM/tool calls when functional state is good.
- **DX (0.10)**: High positive; run reports become more honest about “works but still rough edges”.

## Rollback Plan

- Gate the new logic behind a config flag (e.g. `KOTEF_GOAL_FIRST_V2=1`):
  - If regressions appear (e.g. runs marked `done_partial` too aggressively), flip the flag to disable functional‑probe‑aware stopping and revert to current behaviour.
- Keep existing tests for goal‑first behaviour; add new tests without deleting old ones so we can compare behaviours across versions.

