# Ticket: 11 Failure Feedback Loop & Bounded Fix Cycles

Spec version: v1.1  
Context: `.sdd/project.md` (DoD, risks), `.sdd/architect.md` (Quality Gates, Stop Rules), `.sdd/best_practices.md` (Observability, Error Handling), current runtime in `src/agent/graph.ts`, `src/agent/nodes/{planner, coder, verifier, snitch}.ts`, `src/tools/test_runner.ts`.  
Dependencies: 10-execution-profiles-and-command-policy (profile config).

## Objective & DoD

Introduce a **structured failure feedback loop** so kotef can:

- Observe failing tests/commands once.
- Summarize and classify the failures.
- Attempt a bounded number of targeted fix cycles.
- Stop gracefully (with a clear status and guidance) instead of looping indefinitely.

**Definition of Done**

- [ ] A `failureHistory` structure is added to `AgentState` (e.g. `{ attempts: number; lastErrorKinds: string[]; lastCommands: string[]; }`).
- [ ] `runCommand` / `run_tests` capture failure information (exit code, stderr, command) and append it to `failureHistory`.
- [ ] `verifierNode`:
  - [ ] Parses test results into simple categories (`"test_failure"`, `"lint_failure"`, `"runtime_error"`, `"tooling_error"`).
  - [ ] Updates `failureHistory` accordingly.
  - [ ] Sets an explicit `done=false` and includes a short textual summary in `state.testResults.summary`.
- [ ] `plannerNode`:
  - [ ] Reads `failureHistory` and uses it in its JSON `plan` field (e.g. “fix imports in tests based on ModuleNotFoundError”).
  - [ ] Enforces a **max fix cycles per run** (e.g. 3 planner→coder→verifier iterations). After that, it must choose `next="snitch"` or `next="done"` with reason `"bounded_attempts_exceeded"`.
- [ ] `snitchNode` writes the summarized failure info into `.sdd/issues.md` with enough detail to debug later (goal, attempts count, last error kinds, last failing command).
- [ ] A test demonstrates that with a persistent failing test, kotef:
  - [ ] Tries to fix it a finite number of times.
  - [ ] Then stops and logs the failure instead of oscillating indefinitely.

## Implementation Sketch

```ts
// src/agent/state.ts
export interface FailureHistoryEntry {
  command: string;
  exitCode: number;
  kind: 'test_failure' | 'lint_failure' | 'runtime_error' | 'tooling_error' | 'unknown';
  summary: string; // short human-readable, derived from stderr
}

export interface AgentState {
  // ...
  failureHistory?: {
    attempts: number;
    entries: FailureHistoryEntry[];
  };
}
```

```ts
// src/tools/test_runner.ts – wrap result
return {
  command,
  exitCode,
  stdout,
  stderr,
  passed,
  kind: classifyFailure(command, exitCode, stderr), // helper
};
```

```ts
// src/agent/nodes/verifier.ts – on failure
const summary = summarizeFailure(result); // 1–3 lines
const history = state.failureHistory ?? { attempts: 0, entries: [] };
history.attempts += 1;
history.entries.push({ command: result.command, exitCode: result.exitCode, kind: result.kind, summary });

return {
  testResults: { ...result, summary },
  failureHistory: history,
  done: result.passed,
};
```

```ts
// src/agent/nodes/planner.ts – bounded cycles
const history = state.failureHistory ?? { attempts: 0, entries: [] };
const MAX_ATTEMPTS = 3;

if (!testResultsPassed && history.attempts >= MAX_ATTEMPTS) {
  decision.next = 'snitch';
  decision.reason = 'bounded_attempts_exceeded';
}
```

## Steps

1. **Extend AgentState**
   - [ ] Add `failureHistory` to `src/agent/state.ts`.
   - [ ] Update `src/agent/graph.ts` channels to include `failureHistory` with an appropriate reducer.

2. **Enrich test runner results**
   - [ ] Extend `TestRunResult` (or introduce a new `CommandRunResult`) with `kind` and `summary` fields.
   - [ ] Implement a small `classifyFailure(command, exitCode, stderr)` helper:
     - [ ] `pytest` / `npm test` with non-zero → `test_failure`.
     - [ ] `ruff`, `eslint`, `black`, `mypy`, `pylint` → `lint_failure`.
     - [ ] `flet run`, `node`, `python` with tracebacks → `runtime_error`.
     - [ ] Everything else → `unknown`.
   - [ ] Implement `summarizeFailure` to extract a single-line message (e.g. first failing test, first error line).

3. **Hook verifier into history**
   - [ ] In `verifierNode`, when tests fail:
     - [ ] Update `failureHistory` with a new entry.
     - [ ] Attach a `summary` to `testResults`.
   - [ ] Ensure this state flows back into `plannerNode` through graph channels.

4. **Make planner bounded and feedback-aware**
   - [ ] Update `plannerNode` logic to:
     - [ ] Read `failureHistory` and `testResults.summary`.
     - [ ] Include a short comment in `plan[]` entries referring to the failure summary.
     - [ ] Enforce a hard `MAX_ATTEMPTS` per run, routing to `snitch` when exceeded.
   - [ ] Update `src/agent/prompts/planner.md` to explain the failure feedback and bounded attempts rules.

5. **Extend snitch logging**
   - [ ] In `snitchNode`, when invoked due to bounded attempts or persistent failures:
     - [ ] Write a new section to `.sdd/issues.md` containing:
       - [ ] User goal.
       - [ ] Number of attempts.
       - [ ] Last few failure entries (command, kind, short summary).
       - [ ] Suggested human follow-up (e.g. “Inspect test X, error Y”).

6. **Tests**
   - [ ] Add `test/agent/failure_loop.test.ts` to simulate:
     - [ ] A deliberately broken test suite that always fails.
     - [ ] Ensure the graph runs planner→coder→verifier no more than `MAX_ATTEMPTS` times.
     - [ ] Assert that `failureHistory.attempts` equals `MAX_ATTEMPTS` and that `done=false` plus a clear snitch entry is created.

## Affected Files / Modules

- `src/agent/state.ts`
- `src/agent/graph.ts`
- `src/tools/test_runner.ts`
- `src/agent/nodes/verifier.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/snitch.ts`
- `src/agent/prompts/planner.md`
- `.sdd/issues.md` (runtime file, structure update)
- `test/agent/failure_loop.test.ts` (new)

## Tests

```bash
npm test -- test/agent/failure_loop.test.ts
```

## Risks & Edge Cases

- Over-simplified classification may mislabel some failures; that’s acceptable as long as the summary is readable and the loop is bounded.
- Too small `MAX_ATTEMPTS` could stop fixes prematurely; start with a moderate number (3–4) and adjust based on real runs.
- Capturing and storing large stderr may bloat state; mitigation: trim summaries to a few lines and store full logs only in run reports.

## Non‑Goals / Pitfalls to Avoid

- Do **not** try to fully parse pytest/Jest output into structured AST; keep classification heuristic and robust.
- Do **not** silently swallow failures; the user must see in `.sdd/issues.md` why we stopped and what commands failed.
- Do **not** remove existing quality gates; this ticket only bounds attempts and adds observability, it does not relax the DoD itself.

