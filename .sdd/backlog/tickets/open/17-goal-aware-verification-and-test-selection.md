# Ticket: 17 Goal‑Aware Verification & Test Selection

Spec version: v1.2  
Context: `.sdd/architect.md` (Goal‑First DoD, profiles), `.sdd/best_practices.md` (Performance & Cost Guardrails, Testing Strategy), runtime verifier and coder nodes `src/agent/nodes/{verifier.ts,coder.ts}`, CLI in `src/cli.ts`, and logs from recent runs (e.g. Python GUI task and Vite import‑error scenario).  
Dependencies: 13 (Goal‑First DoD), 14 (stop rules), 16 (prompt refactor).

## Objective & DoD

Make verification **goal‑ and stack‑aware** so that:

- The agent runs the **right checks** for the task (e.g., `pytest` for a Python app, `npm run dev`/`vite build` for a Vite frontend, not always `npm test`).
- Tiny, local tasks aren’t blocked by unrelated global test failures.
- Verifier knows when a failure is **in‑scope** vs **out‑of‑scope** and can:
  - accept partial success,
  - explain remaining issues,
  - or escalate appropriately.

### Definition of Done

- [ ] A **verification policy** is defined in `.sdd/architect.md` and reflected in code:
  - [ ] For each task type (e.g. “create new file”, “fix specific error”, “refactor module”) and stack (Python/Node/Frontend), what commands should be run and how strict to be.
- [ ] Verifier:
  - [ ] Detects likely test commands from the repo (e.g. `package.json` scripts, `pyproject.toml`/`requirements.txt`).
  - [ ] Chooses a small set of **appropriate commands** per goal.
  - [ ] Records the mapping `goal → verification commands` in state and in the run report.
- [ ] For `tiny` and `yolo` tasks:
  - [ ] Verifier can skip heavy global test suites and rely on targeted commands (e.g. running `pytest tests/test_app.py` instead of `pytest` over the entire repo) or even manual instructions.
- [ ] Planner and Verifier can distinguish:
  - [ ] “Goal completed but global tests still broken” → partial success with explanation and optional follow‑up ticket.
  - [ ] “Goal not met yet” → continue coding.

## Implementation Sketch

### 1. Verification Policy in SDD

Add a section to `.sdd/architect.md`, e.g. “Verification Strategy & Command Selection”, that:

- Describes:
  - How to infer project type from files (presence of `package.json`, `pyproject.toml`, `requirements*.txt`, `vite.config.*`, etc.).
  - Preferred commands per stack:
    - Node/TS: `npm test`, `npm run lint`, `npm run build`.
    - Vite frontend: `npm run dev` (smoke), `npm run build` or `vite build`.
    - Python: `pytest`, `pytest <specific tests>`, `python app.py` for smoke.
- Defines profiles:
  - `strict`: run full suite relevant to stack.
  - `fast`: run core tests or subset.
  - `smoke` / `yolo`: run at most one or two cheap commands.

### 2. Repo‑Aware Command Detection

Add a helper in `src/agent/utils/verification.ts`:

```ts
export interface DetectedCommands {
  stack: 'node' | 'vite_frontend' | 'python' | 'unknown';
  primaryTest?: string;   // e.g. "npm test"
  smokeTest?: string;     // e.g. "npm run dev" or "python app.py"
  buildCommand?: string;  // e.g. "npm run build"
}

export function detectCommands(rootDir: string): Promise<DetectedCommands> { /* ... */ }
```

Implementation ideas:

- Inspect `package.json`:
  - If `scripts.test` exists → `primaryTest = "npm test"`.
  - If `scripts.dev` or `scripts.start` exist + `vite` dependency → `smokeTest = "npm run dev"`.
- Inspect Python files and `pyproject.toml` / `requirements*.txt` for Python projects:
  - If `pytest` present → `primaryTest = "pytest"`.
  - Try to detect a main app entry (e.g. `app.py`) → `smokeTest = "python app.py"`.

### 3. Verifier Policy Logic

In `src/agent/nodes/verifier.ts`:

- Use `detectCommands` once per run (cache result in state).
- Incorporate **goal text**:
  - If goal mentions “fix Vite import errors”, prefer:
    - `npm run dev` or `npm run build` as smoke tests.
  - If goal mentions “add a new test”, prefer running that specific test file.
  - If goal mentions “create a Python GUI”, prefer `python app.py` followed by a narrow `pytest tests/test_app.py`.
- Respect profile:

```ts
switch (profile) {
  case 'strict':
    commands = [detected.primaryTest ?? defaultForStack];
    break;
  case 'fast':
    commands = [detected.primaryTest ?? detected.smokeTest].filter(Boolean);
    break;
  case 'smoke':
  case 'yolo':
    commands = [detected.smokeTest].filter(Boolean);
    break;
}
```

- For each command:
  - Run via `run_tests` / `run_command`.
  - Classify failures:
    - If logs show identical errors as in previous attempts and the changed files are unrelated, mark as **out‑of‑scope**.
    - Else mark as **blocking** and route back to coder.

### 4. Partial Success & Follow‑Up Tickets

In Planner (and possibly Snitch):

- When:
  - goal is met (functional behaviour verified for the changed component),
  - but global tests or unrelated checks still fail,
  - and profile is `fast` or `yolo`,
- Planner should:
  - Set `done=true` with `terminalStatus='done_partial'`.
  - Ask Snitch/TicketCloser to file a follow‑up ticket in `.sdd/backlog/tickets/open` (or `.sdd/issues.md`) describing:
    - “Global test suite failing; goal X achieved; issues remain Y.”

## Steps

1. **Extend SDD with verification policy**
   - [ ] Update `.sdd/architect.md` with a Verification Strategy section.
   - [ ] Add stack detection patterns and profile‑specific expectations.

2. **Implement detection helper**
   - [ ] Implement `detectCommands` in a new `src/agent/utils/verification.ts`.
   - [ ] Add tests that feed in small sample repos (fixtures) for Node, Vite, and Python and assert detected commands.

3. **Integrate into Verifier**
   - [ ] Call `detectCommands` at run start (or first verifier call) and store result in state.
   - [ ] Modify Verifier logic to pick commands based on (goal, stack, profile).
   - [ ] Classify failures as blocking vs out‑of‑scope based on which files changed and the goal.

4. **Planner behaviour**
   - [ ] Update planner prompt and implementation to:
     - [ ] Consider `DetectedCommands`, last results, and whether failures are out‑of‑scope.
     - [ ] Decide between continuing fixes vs accepting partial success vs escalating.

5. **Run report**
   - [ ] Record which commands were run and their classification in `.sdd/runs/*.md`.

## Affected Files / Modules

- `.sdd/architect.md`
- `src/agent/utils/verification.ts` (new)
- `src/agent/nodes/{verifier.ts,planner.ts,coder.ts}`
- `src/agent/state.ts` (for storing detected commands and failure classifications)
- `src/agent/run_report.ts`
- `test/agent/verification_policy.test.ts` (new)

## Risks & Edge Cases

- Heuristics for stack detection may misclassify weird repos; mitigate by keeping logic simple, logging decisions, and allowing overrides via `.sdd/config.json`.
- Running `npm run dev` or `pytest` may require additional setup; for now, we treat command failures as signals but do not attempt to manage long‑running dev servers.

## Non‑Goals

- This ticket does **not** implement full CI integration or containerized test environments.
- It does **not** attempt to auto‑fix all global test failures; it focuses on aligning verification with each run’s specific goal.


