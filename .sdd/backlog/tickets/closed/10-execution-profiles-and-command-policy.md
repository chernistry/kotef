# Ticket: 10 Execution Profiles & Command Policy Hardening

Spec version: v1.1  
Context: `.sdd/project.md` (DoD, performance & cost constraints), `.sdd/architect.md` (Execution Profiles, Quality Gates), `.sdd/best_practices.md` (Performance & Cost Guardrails, Tooling), current runtime in `src/agent/*`, `src/tools/test_runner.ts`.  
Dependencies: 01–09 (core runtime, SDD driver, graph, prompts) – all closed; this ticket is a behaviour refinement layer.

## Objective & DoD

Make kotef’s execution profiles (`strict`, `fast`, `smoke`, `yolo`) **real, enforceable policies** instead of soft hints, so that:

- Heavy commands (`pip install …`, `pytest --cov`, `ruff --fix`, `flet run …`) are **bounded and profile-aware**.
- We avoid noisy `pip install` / test / lint loops for simple tasks.
- The agent can be fast and cheap by default, but still robust in `strict`.

**Definition of Done**

- [ ] A single source of truth exists for execution profiles and command budgets, e.g. `src/agent/profiles.ts`.
- [ ] For each profile, there is a documented policy:
  - [ ] Allowed/typical commands (tests, linters, formatters, app run).
  - [ ] Max number of shell commands per run.
  - [ ] Max number of test invocations per run.
  - [ ] Whether package installs / browser-like tools are allowed.
- [ ] `coderNode` and `verifierNode` are refactored to use this config instead of ad‑hoc heuristics:
  - [ ] Commands beyond the configured budget are **skipped** with a clear tool-result message (already partially done, but driven by config, not hardcoded).
  - [ ] `run_tests` default command is chosen from profile+stack (e.g. favour `pytest` over `npm test` for Python stacks), not re‑guessed every time.
  - [ ] Heavy commands like `flet run`, `playwright install`, `pip install` are treated as “expensive” and have per-profile caps (e.g. 0 in `smoke`, 1 in `fast`, 2 in `strict`, 2–3 in `yolo`).
- [ ] `planner` prompt is updated to describe the profiles clearly and to **not** force `strict` behaviour when `runProfile` is `fast` or `yolo`.
- [ ] There is a short markdown doc (`docs/execution_profiles.md` or section in `.sdd/architect.md`) describing the semantics, so future tickets can rely on them.

## Implementation Sketch

```ts
// src/agent/profiles.ts
export type ExecutionProfile = 'strict' | 'fast' | 'smoke' | 'yolo';

export interface CommandPolicy {
  maxCommands: number;
  maxTestRuns: number;
  allowPackageInstalls: boolean;
  allowAppRun: boolean; // flet run / npm start
}

export const PROFILE_POLICIES: Record<ExecutionProfile, CommandPolicy> = {
  strict: { maxCommands: 20, maxTestRuns: 5, allowPackageInstalls: true, allowAppRun: true },
  fast:   { maxCommands: 8,  maxTestRuns: 3, allowPackageInstalls: false, allowAppRun: true },
  smoke:  { maxCommands: 3,  maxTestRuns: 1, allowPackageInstalls: false, allowAppRun: false },
  yolo:   { maxCommands: 15, maxTestRuns: 4, allowPackageInstalls: true, allowAppRun: true },
};
```

```ts
// src/agent/nodes/coder.ts (pseudo)
const policy = PROFILE_POLICIES[executionProfile];
let commandCount = 0;
let testCount = 0;

if (tool === 'run_command') {
  commandCount++;
  if (commandCount > policy.maxCommands) {
    return "Skipped: command budget exceeded for profile";
  }
  if (!policy.allowPackageInstalls && looksLikeInstall(args.command)) {
    return "Skipped: installs not allowed in this profile";
  }
}

if (tool === 'run_tests') {
  testCount++;
  if (testCount > policy.maxTestRuns) {
    return "Skipped: test budget exceeded for profile";
  }
}
```

## Steps

1. **Introduce profile config**
   - [ ] Add `src/agent/profiles.ts` with a typed `ExecutionProfile` and `PROFILE_POLICIES`.
   - [ ] Move any profile-specific heuristics from `coderNode` / `verifierNode` into a shared helper (e.g. `resolveExecutionProfile(state)`).
   - [ ] Ensure `state.runProfile` is validated against `ExecutionProfile` and defaults to `fast` if unknown.

2. **Refactor `coderNode`**
   - [ ] Replace existing ad‑hoc counters with policy-driven counters:
     - [ ] Track `commandCount` and `testCount` separately.
     - [ ] Apply policy caps (`maxCommands`, `maxTestRuns`) with clear tool responses when exceeded.
   - [ ] Implement `looksLikeInstall(command: string)` to detect `pip install`, `npm install`, `pnpm add`, etc., and respect `allowPackageInstalls`.
   - [ ] Mark obviously heavy commands (e.g. `flet run`, `playwright install`) and treat them as consuming more “budget” (optional: weight=2).

3. **Refactor `verifierNode`**
   - [ ] Use the same profile helper to decide whether to run tests at all for a given profile.
   - [ ] For `smoke`, skip tests entirely with a structured “not run in smoke profile” result.
   - [ ] For `fast` / `yolo`, run only the main test command once, unless policy allows more.

4. **Align planner prompt & architect SDD**
   - [ ] Update `src/agent/prompts/planner.md` to:
     - [ ] Treat `runProfile` coming from CLI / state as authoritative (no auto-switch back to `strict`).
     - [ ] Clarify when to use which profile, focusing on dev experience and cost.
   - [ ] Add a concise section in `.sdd/architect.md` or a new `docs/execution_profiles.md` detailing the semantics so future tickets can reference them instead of inlining assumptions.

5. **Harden against regressions**
   - [ ] Add/extend tests in `test/agent/coder_profile.test.ts` (new file) to simulate:
     - [ ] Exceeding `maxCommands` in `fast` and `smoke` profiles.
     - [ ] Blocking `pip install` in `fast` profile.
     - [ ] Allowing multiple installs and full pipelines in `strict` / `yolo`.
   - [ ] Ensure E2E scenario(s) in `test/scenarios` still pass with new policy (adjust expectations if necessary).

## Affected Files / Modules

- `src/agent/profiles.ts` (new)
- `src/agent/state.ts` (profile type alignment, if needed)
- `src/agent/nodes/coder.ts`
- `src/agent/nodes/verifier.ts`
- `src/agent/prompts/planner.md`
- `.sdd/architect.md` or `docs/execution_profiles.md`
- `test/agent/coder_profile.test.ts` (new)

## Tests

```bash
npm test -- test/agent/coder_profile.test.ts
npm run test:e2e   # existing E2E, to ensure behaviour is still sane
```

## Risks & Edge Cases

- Too aggressive budgets can cause the agent to **stop fixing real issues too early**. Mitigation: start with generous limits in `strict` and tune based on E2E runs.
- Misclassification of commands as “installs” or “heavy” might block legitimate use-cases (e.g. custom scripts). Mitigation: keep detection simple and conservative; log decisions clearly in tool results for debugging.
- Changing default behaviour for profiles may alter expectations from existing tickets – ensure SDD explicitly documents the new semantics to avoid confusion.

## Non‑Goals / Pitfalls to Avoid

- Do **not** hardcode project-specific commands in profile config (e.g. `pytest tests/test_app.py`). Keep it generic and stack-aware (Python vs Node).
- Do **not** try to predict exact test coverage or lint results in the planner – this ticket is about limiting command usage, not about making the planner “smarter”.
- Do **not** remove `strict` behaviour; instead, make it an explicit, well-documented opt‑in for heavy, production-like runs.

