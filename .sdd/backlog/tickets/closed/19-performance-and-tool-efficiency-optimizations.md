# Ticket: 19 Performance & Tool‑Use Efficiency

Spec version: v1.2  
Context: `.sdd/best_practices.md` (Performance & Cost Guardrails), `.sdd/architect.md` (profiles, stop rules), logs from slow runs (Python GUI task, Vite import errors, Flet migration), runtime nodes `src/agent/nodes/{coder.ts,verifier.ts,planner.ts}`, tools in `src/tools/*`.  
Dependencies: 13 (Goal‑First DoD), 14 (stop rules), 16 (prompt refactor), 17 (verification policy).

## Objective & DoD

Make the agent **noticeably faster and more efficient** by:

- reducing redundant tool calls (especially repeated `write_patch` and `npm test` loops),
- respecting **time and token budgets** from `.sdd/best_practices.md`, and
- using profile/taskScope to scale its effort appropriately.

### Definition of Done

- [ ] A simple **budget system** is implemented:
  - [ ] Per‑run limits for:
    - total `run_command` / `run_tests` calls,
    - total web requests,
    - approximate token usage per node (if accessible from LLM client).
  - [ ] When budgets are hit, the agent:
    - [ ] either returns partial success (with explanation),
    - [ ] or escalates via Snitch, but never loops indefinitely.
- [ ] Coder:
  - [ ] Avoids re‑applying nearly identical patches more than N times on the same file/hunk.
  - [ ] Aggregates multiple small edits into fewer larger patches when reasonable (e.g. group import‑path fixes).
- [ ] Verifier:
  - [ ] Limits the number of full test runs per profile.
  - [ ] In `yolo` and `smoke`, avoids running expensive test commands more than once unless explicitly needed.
- [ ] Common commands (e.g. `pip install`, `npm test`, `flet run app.py`) are logged with counts in the run report for future tuning.

## Implementation Sketch

### 1. Budget Tracking in State

Extend `AgentState` with:

```ts
export interface BudgetState {
  maxCommands: number;
  maxTestRuns: number;
  maxWebRequests: number;
  commandsUsed: number;
  testRunsUsed: number;
  webRequestsUsed: number;
}
```

Initial values derived from:

- `.sdd/best_practices.md` (Performance & Cost Guardrails).
- profile (`strict` vs `yolo`) and taskScope (`tiny` vs `large`).

Example:

- strict/large: `maxCommands=60`, `maxTestRuns=10`, `maxWebRequests=30`.
- yolo/tiny: `maxCommands=20`, `maxTestRuns=2`, `maxWebRequests=10`.

Update counters in:

- `run_command` / `run_tests` tool wrappers.
- `web_search` / `deep_research` tools.

### 2. Budget‑Aware Nodes

Planner:

- If budgets are nearly exhausted:

```ts
if (budget.commandsUsed >= budget.maxCommands ||
    budget.testRunsUsed >= budget.maxTestRuns ||
    budget.webRequestsUsed >= budget.maxWebRequests) {
  // decide whether to:
  // - accept partial success (if functional goal met), or
  // - escalate to snitch with 'aborted_stuck' / 'budget_exhausted'
}
```

Verifier:

- Before running tests, check `testRunsUsed` vs `maxTestRuns`.
- For `tiny`/`yolo` tasks, skip heavy tests after first attempt if they remain red and no relevant changes were made.

Coder:

- Before applying patches, compute a **patch fingerprint** (e.g. hash of diff text).
- Track fingerprints per file; if the same fingerprint reappears more than N times:
  - Stop trying that patch and report being stuck.

### 3. Grouping Similar Edits

For scenarios like Vite import‑path fixes:

- Enhance Coder prompt and logic to:
  - Scan all affected files (e.g. all `frontend/src/components/home/*.tsx`) in a single `list_files` / `read_file` pass.
  - Generate one or a few aggregated patches rather than a separate `write_patch` loop per file per attempt.

Implementation idea:

- Provide Coder prompt with:
  - a list of file paths hitting the same error (from logs),
  - a suggestion: “Fix all of these in one go.”

### 4. Run Report Metrics

In `run_report.ts`:

- Emit budget usage:

```md
## Budgets
- Commands: 37 / 60
- Test runs: 4 / 10
- Web requests: 6 / 30
```

- Also record top repeated commands and their counts.

## Steps

1. **Define budgets in SDD**
   - [ ] Add a short “Runtime Budgets” subsection to `.sdd/best_practices.md` (Node/TS‑agnostic, agent‑level).

2. **State & tool instrumentation**
   - [ ] Extend `AgentState` with `BudgetState`.
   - [ ] Wrap `run_command`, `run_tests`, and web tools to update counters.

3. **Planner & Verifier integration**
   - [ ] Update planner prompt & node to consider budget exhaustion when choosing `next`.
   - [ ] Update Verifier to skip repeated expensive tests once budgets are nearly spent.

4. **Coder patch deduplication**
   - [ ] Implement patch fingerprint tracking.
   - [ ] Add logic to treat repeated identical patches as “no progress”.

5. **Grouping similar edits**
   - [ ] Adjust Coder prompt to ask it to fix families of similar issues together.
   - [ ] Ensure Coder reads all related files first, then patches them in one or a few calls.

6. **Reporting**
   - [ ] Extend run report with budget usage & repeated commands.

## Affected Files / Modules

- `.sdd/best_practices.md`
- `src/agent/state.ts`
- `src/agent/tools/*` (wrappers)
- `src/agent/nodes/{planner.ts,coder.ts,verifier.ts}`
- `src/agent/run_report.ts`
- `test/agent/budgets_and_efficiency.test.ts` (new)

## Risks & Edge Cases

- Budgets that are too tight can prematurely stop useful work; start conservative and adjust as we observe real runs.
- Grouping edits must not make diffs too large or harder to understand; keep grouping at “same error family” granularity.

## Non‑Goals

- This ticket does **not** implement real‑time token accounting; approximate budgets based on tool usage are sufficient.
- It does **not** introduce external monitoring systems; metrics are kept in run reports and logs.


