# Ticket: 25 Planner Loop Detection & Circuit Breakers

Spec version: v1.2  
Context: `.sdd/architect.md`, `.sdd/best_practices.md` (bounded loops, failure transparency), `agentic_systems_building_best_practices.md` (loop detection, timeouts), runtime graph `src/agent/graph.ts`, planner node `src/agent/nodes/planner.ts`, researcher node `src/agent/nodes/researcher.ts`.  
Dependencies: 20 (project summary), 21 (eval harness), 23 (coder turn budget).

## Objective & DoD

Prevent planner from getting stuck in low-value loops such as:

> planner → “need to assess” → researcher → “already done” → planner → “need to assess” → …

by implementing:

- edge-level loop counters (per transition),
- detection of “no-progress” cycles,
- and a clear, SDD-aligned escalation path (`snitch` / `ask_human` / `done_partial`).

### Definition of Done

- [ ] Loop counters in `AgentState` (`loopCounters`) are **actively maintained**:
  - [ ] `planner_to_researcher`, `planner_to_coder`, `planner_to_verifier` are incremented when planner selects those next hops.
  - [ ] Counters reset or decay when progress is made (e.g., new research results, new file changes, new test results).
- [ ] Planner enforces **per-edge loop limits** (`MAX_LOOP_EDGE`) distinct from `MAX_STEPS`:
  - [ ] If `planner_to_researcher` exceeds limit without meaningful change in research results, planner routes to `snitch` with `terminalStatus = 'aborted_stuck'`.
  - [ ] Similar logic for `planner_to_verifier` and `planner_to_coder` when they oscillate without new progress.
- [ ] Researcher respects loop detection:
  - [ ] If invoked with identical query & context repeatedly, it returns a structured “no new information” result instead of pretending fresh research.
- [ ] Run reports (`.sdd/runs/*`) clearly show when a run is terminated due to loop detection:
  - [ ] `terminalStatus` set to `aborted_stuck`.
  - [ ] Stop reason message summarises which loop was detected and why.

## Implementation Sketch

### 1. Use `loopCounters` channel in graph

In `src/agent/graph.ts`, the state graph already defines a `loopCounters` channel with a default value. This ticket:

- ensures `loopCounters` is updated in planner and/or at edge transitions,
- and that planner uses it to make decisions.

Implementation approach:

- In `plannerNode` (inside `src/agent/nodes/planner.ts`):
  - When computing the next node (`next = decision.next`), read current `loopCounters` from state (with sensible defaults).
  - After deciding `next`, compute updated counters:

```ts
const current = state.loopCounters || {
  planner_to_researcher: 0,
  planner_to_verifier: 0,
  planner_to_coder: 0,
};

const updated = { ...current };
if (next === 'researcher') updated.planner_to_researcher++;
if (next === 'verifier')   updated.planner_to_verifier++;
if (next === 'coder')      updated.planner_to_coder++;
```

  - Whenever planner observes “progress” it should reset relevant edges:
    - If `state.researchResults` changed meaningfully (see below), reset `planner_to_researcher`.
    - If `state.fileChanges` gained new entries, reset `planner_to_coder`.
    - If `state.testResults` changed command or result, reset `planner_to_verifier`.

Attach `loopCounters: updated` to the planner’s returned partial state so the graph channel persists it.

### 2. Define “progress” heuristics

To avoid false positives, we need cheap approximations of “something changed”:

- `researchResults`:
  - Track `state.researchQuality?.lastQuery` and `attemptCount`.
  - Consider progress when:
    - `lastQuery` changes, or
    - `attemptCount` increases, or
    - the length or hash of `researchResults` changes.
- `fileChanges`:
  - Compare previous vs new key set size.
- `testResults`:
  - Consider progress when the primary failing command changes, or pass/fail status flips.

This does not need to be perfect; the goal is to detect **obvious stasis**, not micro-changes.

### 3. Circuit breaker thresholds

In `plannerNode`:

- The file already defines or mentions `MAX_LOOP_EDGE = 5`. Make this real:

```ts
const MAX_LOOP_EDGE = 5; // or lower; tune later via config if needed
```

- Before committing to `next`, check:

```ts
if (next === 'researcher' && updated.planner_to_researcher > MAX_LOOP_EDGE) {
  // If research quality is low and unchanged, we are stuck.
  return {
    terminalStatus: 'aborted_stuck',
    plan: {
      next: 'snitch',
      reason: `Planner detected loop planner→researcher without progress after ${updated.planner_to_researcher} hops.`,
      profile: state.runProfile,
      plan: [],
    },
    done: true,
    loopCounters: updated,
  };
}
```

- Apply similar checks for `planner_to_verifier` and `planner_to_coder`, but with slightly different messages and maybe thresholds (e.g., 3 for verifier, since repeated failing tests are expensive).

### 4. Researcher: “no new info” feedback

In `src/agent/nodes/researcher.ts`:

- Use `state.researchQuality` and queries produced by the planner to detect repeated research.
- If the planner sends the same query (or near-identical) and previous `researchResults` already exist:
  - Instead of performing a full `deepResearch` again, return:

```ts
return {
  researchResults: state.researchResults,
  researchQuality: {
    ...state.researchQuality,
    reasons: `${state.researchQuality?.reasons || ''}\n\nNo new information found; repeated query "${primaryQuery}".`,
  },
};
```

- This gives planner a clear signal that repeating research is unlikely to help, making loop detection more meaningful.

### 5. Run reports & snitch integration

The `snitch` node and run report writer already handle `terminalStatus` and `failureHistory`. Extend:

- When planner routes to `snitch` due to loop detection:
  - Set `terminalStatus = 'aborted_stuck'`.
  - Add a short explanation to `plan.reason` mentioning which edge looped.
- In `src/agent/run_report.ts`:
  - Ensure `stopReason` or the “Status” section clearly mentions the loop detection reason if present.

## Steps

1. **Planner loop counters**
   - [ ] Implement in-planner updates to `loopCounters`.
   - [ ] Implement progress-based resets.
   - [ ] Wire in `MAX_LOOP_EDGE` checks for each edge and route to `snitch` when exceeded.

2. **Researcher no-progress handling**
   - [ ] Detect repeated queries and avoid redundant deep research.
   - [ ] Return “no new info” markers in `researchQuality.reasons`.

3. **Reporting**
   - [ ] Integrate loop detection reasons into `snitch` issues and run reports.

4. **Testing**
   - [ ] Unit tests:
     - Planner routing into loops, ensuring `snitch` is eventually chosen.
     - Researcher behaviour on repeated queries.
   - [ ] Integration-style test:
     - Simulate a run where planner repeatedly asks for research without changing plan; assert early termination with `aborted_stuck`.

## Affected Files / Modules

- `src/agent/graph.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/researcher.ts`
- `src/agent/run_report.ts`
- `src/agent/state.ts` (if additional loop metadata is needed)
- Tests: `test/agent/planner_loops.test.ts`, `test/agent/researcher_repeats.test.ts` (new).

## Risks & Edge Cases

- Over-aggressive loop detection could prematurely abort runs where slow, incremental progress is actually being made. Mitigation: keep thresholds conservative and progress heuristics permissive.
- Under-aggressive detection might still miss pathological cases; this is acceptable initially as long as we eliminate obvious infinite “no-op” cycles.

## Non-Goals

- Full-blown “progress scoring” or reward modelling; this ticket introduces simple counter-based circuit breakers, not a complete success metric.
- Generalising loop detection to all possible node sequences (e.g. complex multi-node cycles); focus is on the most common failure edges involving planner.


