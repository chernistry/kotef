# Ticket: 35 Supervisor-Level Progress Controller & Stuck Handler

Spec version: v1.3  
Context: `.sdd/architect.md` (Stop Rules & Loops, Run Metrics), `.sdd/context/arch_refactor.md` (sections 5.2, 6.1–6.3), existing loop guards in `planner.ts`, `verifier.ts`, state in `src/agent/state.ts`.  
Dependencies: 11, 14, 19, 25, 30, 31, 32, 33, 34.

## Objective & Definition of Done

Elevate loop control from ad‑hoc per‑node checks to a **supervisor‑level progress controller** that:

- tracks global progress across the entire run (not just per‑node),
- detects repeated “no progress” states (same errors, no new changes),
- routes the agent to a clear **stuck handler** path when appropriate, instead of silent loops.

### Definition of Done

- [ ] `AgentState` already includes loop counters and progress markers; they are consolidated into a small `ProgressState`:
  - [ ] `totalSteps`, `lastProgressStep`,
  - [ ] `consecutiveNoOps` for coder,
  - [ ] `sameErrorCount` and `lastTestSignature` for verifier,
  - [ ] signals from `diagnosticsLog` (Ticket 31) and LSP (Ticket 32).
- [ ] A supervisor policy is defined (in code + SDD) that:
  - [ ] sets thresholds for maximum steps per run (`MAX_STEPS`),
  - [ ] defines what counts as “no progress” (no new file changes, diagnostics unchanged),
  - [ ] decides when to:
    - [ ] continue normal loops,
    - [ ] escalate to a **stuck handler**,
    - [ ] or accept partial success (`done_partial`) when the functional goal is met.
- [ ] Planner Node or a dedicated `StuckHandler` node:
  - [ ] consumes `ProgressState` and crafts a terminal decision:
    - `terminalStatus: 'aborted_stuck' | 'done_partial'`,
    - clear reason and suggestion for human follow‑up in Snitch.
- [ ] Run reports and `.sdd/issues.md` entries clearly record why the run stopped (loops, no progress, budget exhausted).

## Steps

1. **Consolidate progress state**
   - [ ] Introduce a `ProgressState` helper in `src/agent/state.ts` or `src/agent/utils/progress.ts` that captures:

```ts
export interface ProgressState {
  totalSteps: number;
  lastProgressStep?: number;
  consecutiveNoOps: number;
  sameErrorCount: number;
  lastTestSignature?: string;
}
```

   - [ ] Ensure `plannerNode`, `coderNode`, `verifierNode` all update this state consistently.

2. **Define supervisor policy**
   - [ ] In `.sdd/architect.md`, add a concise “Progress & Stop Rules” subsection describing:
     - [ ] global `MAX_STEPS` per run,
     - [ ] thresholds for `consecutiveNoOps` and `sameErrorCount`,
     - [ ] which profiles (`strict` vs `yolo`) are allowed more attempts.
   - [ ] Implement a policy function (e.g. `evaluateProgress(state: AgentState): 'continue' | 'stuck' | 'partial'`) in `src/agent/utils/progress.ts`.

3. **Planner integration / StuckHandler**
   - [ ] Update `plannerNode`:
     - [ ] call `evaluateProgress` at the start of each planning step,
     - [ ] if result is `'stuck'`:
       - [ ] set `terminalStatus = 'aborted_stuck'`,
       - [ ] route to `snitch` or a dedicated `StuckHandler` node with an explanation.
     - [ ] if result is `'partial'` and `FUNCTIONAL_OK` is true:
       - [ ] consider returning `done_partial` with a clear note on remaining issues.
   - [ ] Update `src/agent/prompts/planner.md` to:
     - [ ] reference loop/progress signals in its policies,
     - [ ] discourage planner↔verifier / planner↔coder loops when progress is flat.

4. **Snitch / StuckHandler behaviour**
   - [ ] Update or add a `StuckHandler`/Snitch node to:
     - [ ] write a structured entry into `.sdd/issues.md`:
       - [ ] which loop was detected,
       - [ ] last failing commands and diagnostics,
       - [ ] steps attempted.
     - [ ] mark the run report with `terminalStatus` and `stopReason`.

5. **Tests**
   - [ ] Extend or add `test/agent/flow_stop_rules.test.ts` to cover:
     - [ ] scenario with repeated identical test failures and no file changes → supervisor marks as stuck,
     - [ ] scenario where functional goal is met but some diagnostics remain → `done_partial` under non‑strict profiles,
     - [ ] `MAX_STEPS` guard triggers for intentionally misconfigured graph.

## Affected files/modules

- `.sdd/architect.md` (Progress & Stop Rules)
- `.sdd/best_practices.md` (loop/budget guidance)
- `.sdd/issues.md` (Snitch output format)
- `src/agent/state.ts`
- `src/agent/utils/progress.ts` (new)
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/coder.ts`
- `src/agent/nodes/verifier.ts`
- `src/agent/nodes/snitch.ts` / `StuckHandler` (if split)
- `src/agent/run_report.ts`
- `test/agent/flow_stop_rules.test.ts`

## Tests

- `npm test -- test/agent/flow_stop_rules.test.ts`
- `npm test -- test/agent/goal_first_dod.test.ts`

## Risks & Edge Cases

- Aggressive thresholds could prematurely mark non‑trivial tasks as stuck; start conservative and tune with real logs.
- Mis‑classification of “no progress” if diagnostics parsing is incomplete; rely on multiple signals (file changes + diagnostics + failure counts) rather than any single metric.

## Dependencies

- Upstream:
  - 11‑failure‑feedback‑loop‑and‑bounded‑fix‑cycles
  - 14‑agent‑flow‑and‑stop‑rules‑hardening
  - 19‑performance‑and‑tool‑efficiency‑optimizations
  - 25‑planner‑loop‑detection‑and‑circuit‑breakers
  - 30‑command‑runner‑and‑package‑manager‑detection
  - 31‑diagnostics‑log‑and‑error‑aware‑planning
  - 32‑lsp‑diagnostics‑and‑advanced‑verification
  - 33‑code‑context‑retrieval‑and‑file‑read‑caching
  - 34‑hybrid‑patch‑pipeline‑and‑ast‑fallback


