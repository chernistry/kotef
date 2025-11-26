# Ticket: 56 Full-cycle phase tracking and retrospectives

Spec version: v1.0 / kotef-sd-approaches-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — Implementation Steps, Backlog (Tickets), Evaluation.
- SD-approaches context:
  - `.sdd/context/sd_approaches.md` — entire section 2 (Full-cycle algorithm for coding agent), section 3.7 (“Ability to stop and say partial/blocked”), section 3.10 (Retrospective and agent learning).
- Existing implementation:
  - Planner + progress controller:
    - track budgets, loop counters, terminal statuses.
  - Run reports:
    - capture status, plan, terminalStatus, stopReason.
  - There is no explicit **phase tracking** aligned with the 10 phases in `sd_approaches.md`, nor a structured retrospective record across runs.

## Objective & Definition of Done

Objective:
- Make the **full-cycle phases explicit in AgentState** and add a minimal **retrospective log**, so that:
  - we can see which phases ran, in what order, and where time/budget was spent;
  - the agent can learn (or be tuned) based on structured feedback about where it struggled.

### Definition of Done

- Phase model:
  - [ ] `AgentState` has:
    - [ ] `currentPhase?: string` (from a small enum of phases like `understand_goal`, `analyze_system_state`, `design_decide`, `plan_work`, `implement`, `verify`, `refactor`, `document`, `integrate`, `retro`).
    - [ ] `phaseHistory?: { phase: string; startedAt: string; endedAt?: string; summary?: string }[]`.
  - [ ] Planner and nodes:
    - [ ] update `currentPhase` appropriately as they progress through the algorithm.
    - [ ] append to `phaseHistory` when entering/exiting major phases.
- Retrospective log:
  - [ ] A new file `.sdd/runs/retrospectives.md` (or similar) exists and contains:
    - brief entries per run:

```md
## Run 2025-11-26T.... (ticket X / goal "... ")
- Phases: understand_goal → analyze_system_state → design_decide → plan_work → implement → verify → retro
- Outcome: success | partial | blocked (reason)
- Notes: what went well, what was hard, suggested improvements.
```

  - [ ] `writeRunReport` (or a small helper) appends a retrospective entry based on:
    - final `phaseHistory`,
    - budgets used,
    - terminalStatus and stopReason.
- Prompts:
  - [ ] Planner/Meta-agent prompts are updated to:
    - encourage a short retrospective summary when concluding a run;
    - emphasize systemic improvements (docs, heuristics, patterns) rather than just local fixes.

## Implementation Sketch

### 1. Introduce phase enum and state fields

- In `src/agent/state.ts`:
  - define a TypeScript union or enum for phases.
  - add `currentPhase` and `phaseHistory` fields.
- In planner and nodes:
  - set `currentPhase` appropriately:
    - e.g. planner sets `understand_goal`, `design_decide`, `plan_work`;
    - researcher/coder/verifier can keep `currentPhase` where relevant (`analyze_system_state`, `implement`, `verify`).

### 2. Wire into progress controller

- `src/agent/utils/progress_controller.ts`:
  - incorporate `phaseHistory` into snapshots and stuck detection:
    - e.g. detect loops where the agent oscillates between a small subset of phases.

### 3. Retrospective generation

- Extend `src/agent/run_report.ts` or add a small helper:
  - Build a concise retrospective summary using:
    - phases visited,
    - budgets and metrics (from ticket 53),
    - failureMode / terminalStatus.
  - Append to `.sdd/runs/retrospectives.md`.

### 4. Prompt updates

- `src/agent/prompts/body/meta_agent.md` / `planner.md`:
  - add guidance for a short retrospective bullet list when a run concludes.

## Steps

1. **State & enum**
   - [ ] Add phase enum and state fields.
2. **Planner & nodes**
   - [ ] Update planner and key nodes to set and record phases.
3. **Progress controller & stuck detection**
   - [ ] Integrate phases into progress snapshots.
4. **Retrospective log**
   - [ ] Implement retrospective writing in run_report or helper.
5. **Prompts & docs**
   - [ ] Update prompts to encourage short retrospectives.

## Affected files / modules
- `.sdd/architect.md`
- `.sdd/runs/retrospectives.md` (new)
- `src/agent/state.ts`
- `src/agent/utils/progress_controller.ts`
- `src/agent/run_report.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/prompts/body/meta_agent.md`
- `src/agent/prompts/body/planner.md`

## Tests
- Unit:
  - ensure phaseHistory is recorded and serialized correctly.
- Integration:
  - run a simple scenario and verify a retrospective entry is added.

## Risks & Edge Cases
- Risk of overcomplicating state if phases are too fine-grained.
  - Mitigation: keep enum small and focused on major phases only; treat sub-steps as internal.

## Dependencies
- Upstream:
  - 21-eval-harness-and-regression-suite.md
  - 53-flow-metrics-and-dora-proxies.md

