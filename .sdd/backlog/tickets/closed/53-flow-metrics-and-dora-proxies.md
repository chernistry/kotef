# Ticket: 53 Flow metrics and DORA-style proxies for agent runs

Spec version: v1.0 / kotef-sd-approaches-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — Definition of Done, Metric Profile & Strategic Risk Map, Evaluation sections.
- SD-approaches context:
  - `.sdd/context/sd_approaches.md` — sections 1.1 (DORA & Continuous Delivery, trunk-based development), 1.3 (Testing, reliability, observability), 2 (Phase 10: Retrospective and agent learning), 3.5 (Metrics and signals literacy).
- Existing implementation:
  - Run reports under `.sdd/runs/*` already capture:
    - status, files changed, tests summary, duration, terminalStatus, stopReason, ticket metadata.
  - Ticket 21 “Eval Harness & Regression Suite” adds:
    - scripted scenarios and basic metrics (commands, tests, web calls, loops).
  - Planner and budget logic track:
    - commandsUsed, testRunsUsed, webRequestsUsed, progressHistory.

Missing pieces:
- No explicit **DORA-style flow proxies** (change size, lead time, change failure rate, MTTR-like behaviour).
- No aggregated **flow metrics** across runs for retrospective learning.
- No link between flow metrics and planner decisions (e.g. budget tuning, profile choice).

## Objective & Definition of Done

Objective:
- Introduce a small, practical layer of **flow metrics** inspired by DORA and SPACE so that:
  - each run records local proxies (change size, verification latency, failure mode);
  - these metrics are aggregated over time to inform improvements;
  - planner and eval harness can use them to detect regressions and guide strategy.

### Definition of Done

- Per-run metrics:
  - [ ] `RunSummary` (and `.sdd/runs/*` reports) are extended to include:
    - [ ] `commandsUsed`, `testRunsUsed`, `webRequestsUsed` (from budget state);
    - [ ] `changeSize` proxy (e.g. number of files changed, rough diff size);
    - [ ] `diagnosticLatencySeconds` (time from run start to first successful diagnostic/verification command);
    - [ ] `verificationRuns` (how many times diagnostics/tests were invoked);
    - [ ] `failureMode` (e.g. `none`, `tests_failed`, `build_failed`, `budget_exhausted`, `stuck_loop`, `research_insufficient`).
- Aggregated metrics:
  - [ ] A small script (or extension to `scripts/eval/run_eval.ts`) aggregates recent run reports and computes:
    - [ ] distribution of `changeSize`,
    - [ ] success vs partial/aborted rates,
    - [ ] average `diagnosticLatencySeconds`,
    - [ ] distribution of `commandsUsed` and `webRequestsUsed`.
  - [ ] Summary output (even if console-only) highlights:
    - [ ] scenarios with regressions (e.g. more loops, higher command counts).
- Planner feedback:
  - [ ] Planner accesses recent metrics (e.g. via a cached summary file under `.sdd/cache/flow_metrics.json`) to:
    - [ ] adjust default profiles or budgets for future runs (e.g. reduce yolo usage if failure rate is high);
    - [ ] prefer smaller plans when average changeSize is too large.

## Implementation Sketch

### 1. Extend RunSummary and run_report

- In `src/agent/run_report.ts` and `RunSummary` type:
  - Add fields:

```ts
commandsUsed?: number;
testRunsUsed?: number;
webRequestsUsed?: number;
changeSize?: { filesChanged: number; approxLinesChanged?: number };
diagnosticLatencySeconds?: number;
verificationRuns?: number;
failureMode?: string;
```

- `buildKotefGraph` / planner/coder/verifier nodes:
  - Ensure budget counters and diagnostic timing are exposed in final AgentState so `writeRunReport` can populate these fields.

### 2. Eval harness aggregation

- In `scripts/eval/run_eval.ts` (or a new `analyze_runs.ts`):
  - Parse recent `.sdd/runs/*.md` or a JSON companion file.
  - Compute:
    - success/partial/aborted ratios,
    - average command/test/web request counts,
    - distribution of failureMode.
  - Print a short **flow metrics summary** for each scenario and overall.

### 3. Planner awareness

- Add a small helper (e.g. `src/agent/utils/flow_metrics.ts`) to:
  - read a cached summary file (e.g. `.sdd/cache/flow_metrics.json`),
  - surface high-level signals to Planner:
    - “recent change failure rate high for this scenario type”,
    - “average change size > target”.
- Planner:
  - may use this information to:
    - choose stricter profiles when failure rates are high;
    - adjust budgets for commands/tests;
    - deliberately cut scope for very complex areas.

## Steps

1. **RunSummary & report changes**
   - [ ] Extend `RunSummary` and `writeRunReport` with flow metrics fields.
   - [ ] Wire budget and timing information into final AgentState.
2. **Eval harness integration**
   - [ ] Extend eval scripts to compute and print aggregated flow metrics.
3. **Planner feedback loop**
   - [ ] Implement a minimal `flow_metrics` helper and integrate it into Planner’s context building.
4. **Docs**
   - [ ] Update `.sdd/architect.md` evaluation/metrics section to mention these flow metrics and how to interpret them.

## Affected files / modules
- `.sdd/architect.md`
- `src/agent/run_report.ts`
- `src/agent/state.ts` (if needed to store counts/timestamps)
- `src/agent/nodes/planner.ts`
- `src/agent/utils/flow_metrics.ts` (new)
- `scripts/eval/run_eval.ts` or a new script under `scripts/eval/`

## Tests
- Unit:
  - `run_report` populates new fields correctly from synthetic AgentState.
- Integration:
  - run a small eval scenario and confirm flow metrics appear and aggregate.

## Risks & Edge Cases
- Metrics misinterpreted as “hard SLOs”.
  - Mitigation: document them as guidance, not strict gates, in `.sdd/architect.md`.
- Overhead of parsing many run reports.
  - Mitigation: start with small sample windows or manual triggers.

## Dependencies
- Upstream:
  - 21-eval-harness-and-regression-suite.md
- Downstream:
  - Future adaptive-planning tickets can rely on these metrics.

