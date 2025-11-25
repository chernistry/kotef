# Ticket: 27 Preflight Verification & Syntax Sanity for Edits

Spec version: v1.2  
Context: `.sdd/architect.md`, `.sdd/best_practices.md` (safe edits, fast feedback), `agentic_systems_building_best_practices.md` (verification stages, defence-in-depth), `Prompt_Engineering_Techniques_Comprehensive_Guide.md` (guardrails, failure modes), `src/agent/nodes/{coder.ts,verifier.ts}`, `src/agent/utils/verification.ts`, `src/tools/test_runner.ts`.  
Dependencies: 24 (error-first strategy), 26 (patch hardening).

## Objective & DoD

Reduce “obviously broken” edits reaching the user (e.g. duplicate imports, trivial syntax errors) by:

- introducing a lightweight **preflight syntax sanity** step after edits,
- tightening verifier’s behaviour to always run at least one cheap check when code changed,
- and wiring these checks into run reports so regressions are visible.

### Definition of Done

- [ ] Whenever `coder` produces code changes (`fileChanges` non-empty):
  - [ ] `verifier` runs at least one low-cost check per relevant stack, even in `fast` / `yolo` profiles (unless scope is `tiny`).
  - [ ] For TS/JS projects, this includes a basic `tsc --noEmit` or equivalent “syntax-only” command when available.
  - [ ] For Python, a `python -m py_compile`-style check over changed files is attempted.
- [ ] Preflight checks are treated as **sanity**, not full DoD:
  - [ ] Failing preflight does **not** necessarily block the run in non-`strict` profiles, but:
    - [ ] Planner sees the failure and must either fix or explicitly log partial success.
- [ ] Run reports (`.sdd/runs/*`) display:
  - [ ] Which preflight commands were executed.
  - [ ] Whether they passed or failed, separated from full test suite runs.
- [ ] The previously observed case (“patch with duplicate React import”) is caught by these checks.

## Implementation Sketch

### 1. Extend `DetectedCommands` with syntax/lint commands

In `src/agent/utils/verification.ts`:

- Add optional fields:

```ts
export interface DetectedCommands {
  stack: ProjectStack;
  primaryTest?: string;
  smokeTest?: string;
  buildCommand?: string;
  lintCommand?: string;
  diagnosticCommand?: string;
  syntaxCheckCommand?: string; // NEW
}
```

- Populate `syntaxCheckCommand`:
  - Node/TS:
    - Prefer `npm run lint` if it’s essentially a `tsc --noEmit` or ESLint run.
    - If `tsconfig.json` exists but no lint script, consider `npx tsc --noEmit` as a generic fallback (document this and keep optional).
  - Python:
    - `python -m py_compile` on changed files (see below).
  - Go:
    - `go vet ./...` or `go build` can already play this role; keep optional.

### 2. Verifier: always run at least one sanity check after changes

In `src/agent/nodes/verifier.ts`:

- Compute `hasFileChanges = Object.keys(state.fileChanges || {}).length > 0`.
- When building `commandsToRun`:
  - For `strict`:
    - Keep existing full suite behaviour.
  - For `fast` / `yolo`:
    - If `hasFileChanges` and `syntaxCheckCommand` is present, prepend or append it to `commandsToRun`.
    - Ensure we do not exceed profile `maxTestRuns`; treat syntax check as first priority in the small budget.
  - For `smoke`:
    - If `hasFileChanges` and scope is not `tiny`, prefer syntax check over heavier tests.

### 3. Python-specific handling for changed files

For Python, a full `pytest` run may be too heavy, but `py_compile` is cheap:

- Implement a helper function, e.g. in `verification.ts` or a new util:

```ts
export function buildPythonSyntaxCheckCommand(changedFiles: string[]): string | undefined {
  const pyFiles = changedFiles.filter(f => f.endsWith('.py') || f.endsWith('.pyw'));
  if (pyFiles.length === 0) return undefined;
  const fileArgs = pyFiles.join(' ');
  return `python -m py_compile ${fileArgs}`;
}
```

- When `detectCommands` identifies a Python stack:
  - Use `state.fileChanges` (if accessible) or fallback to simple heuristics to derive changed files for syntax check.
  - Alternatively, for this ticket, accept a coarse `python -m compileall .` as a first approximation.

### 4. Planner integration & partial success

Planner already has logic around `terminalStatus` and partial success. Adjust planner prompt (and, if needed, code) to:

- Treat failing **syntax sanity** checks as:
  - blocking in `strict`,
  - a strong signal for “partial success” or “needs more work” in other profiles.

This ensures that a run where we introduce a trivial syntax error cannot be silently marked “success” without at least a partial/blocked status.

### 5. Reporting

In `src/agent/run_report.ts`:

- Ensure `Verification Strategy` and `Verification Results` sections:
  - Separately highlight preflight/syntax checks vs full test commands.
  - Include a short note when only syntax checks ran (e.g. `tsc --noEmit`).

## Steps

1. **Command detection**
   - [ ] Extend `DetectedCommands` with `syntaxCheckCommand`.
   - [ ] Implement detection heuristics for Node/TS, Python, Go.

2. **Verifier logic**
   - [ ] Update verifier to call `syntaxCheckCommand` where appropriate, respecting profile/test budgets.
   - [ ] Ensure behaviour is skipped for `tiny` scope, unless profile is `strict`.

3. **Planner & prompts**
   - [ ] Update planner prompt to explicitly mention syntax sanity results in its decision-making.
   - [ ] Optionally adjust planner code to treat syntax failures as higher-severity than generic test failures.

4. **Tests**
   - [ ] Add tests for TS/Node repo:
     - Change a TSX file with a deliberate syntax error (duplicate import).
     - Verify `tsc --noEmit` (or equivalent) is run and fails.
   - [ ] Add tests for Python repo:
     - Introduce a syntax error; verify `py_compile` catches it.

5. **Docs**
   - [ ] Update README or internal docs to mention that kotef runs lightweight syntax checks after edits by default, to catch trivial mistakes early.

## Affected Files / Modules

- `src/agent/utils/verification.ts`
- `src/agent/nodes/verifier.ts`
- `src/agent/nodes/planner.ts` (prompt & possibly logic)
- `src/agent/run_report.ts`
- `test/agent/verifier_syntax_sanity.test.ts` (new)

## Risks & Edge Cases

- Additional commands may increase runtime for large repos; mitigate via profile-aware limits and timeouts.
- Some projects may have unusual build pipelines where `tsc --noEmit` or `py_compile` doesn’t align with reality; treat these as best-effort checks and allow users to tune profiles/commands in future tickets.

## Non-Goals

- Full semantic verification (e.g. running full integration tests or browser-based smoke tests); this is about **cheap, fast sanity checks**.
- Designing an entire policy framework for verification; this ticket introduces a simple, pragmatic baseline.


