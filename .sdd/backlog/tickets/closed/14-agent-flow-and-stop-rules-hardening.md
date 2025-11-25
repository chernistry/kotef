# Ticket: 14 Agent Flow & Stop‑Rules Hardening

Spec version: v1.2  
Context: `.sdd/project.md`, `.sdd/architect.md` (Goal‑First DoD, profiles, stop rules), `.sdd/best_practices.md` (DX, cost, safety guardrails), Synapse ideas in `personal_projects/synapse/docs/index.html`, runtime graph in `src/agent/{graph.ts,state.ts}`, nodes `src/agent/nodes/{planner.ts,researcher.ts,coder.ts,verifier.ts,snitch.ts,ticket_closer.ts}`.  
Dependencies: Closed tickets 10 (execution profiles), 11 (failure feedback loop & bounded fix cycles), 13 (Goal‑First DoD & `yolo` behaviour).

## Objective & DoD

The agent must behave like a robust **state machine** with explicit stop rules and escape hatches, not an endless loop that bounces between nodes.

**Primary objective**: eliminate pathological loops (planner↔researcher, planner↔verifier, planner↔coder) and make every run end in one of a small number of clearly defined terminal states that are visible in run reports and consistent with `.sdd/architect.md`.

### Definition of Done

- [ ] The runtime graph has a **small, explicit set of terminal states**, e.g.:
  - `done_success` – goal satisfied to the profile’s DoD.
  - `done_partial` – partial success with remaining issues documented.
  - `aborted_stuck` – bounded attempts reached without progress (with a clear reason).
  - `aborted_constraint` – SDD hard constraint violated (routed through Snitch).
- [ ] Planner, Verifier, and Researcher nodes implement **bounded retries** and **progress checks**:
  - [ ] Planner no longer routes indefinitely planner→researcher when research is already “good enough” or clearly exhausted.
  - [ ] Planner + Verifier stop planner→verifier loops after N repeated identical failures and escalate to `snitch`/`aborted_stuck`.
  - [ ] Coder is not re‑invoked once it has produced no net change for multiple turns on the same error signature.
- [ ] `AgentState` (or equivalent) tracks:
  - [ ] `loopCounters` per edge (e.g. `planner_to_researcher`, `planner_to_verifier`, `planner_to_coder`) and a small history of reasons.
  - [ ] A `terminalStatus` field set once at the end of the run.
  - [ ] A coarse `lastProgressAtStep` marker (e.g. last time files changed, new tests passed, or research quality improved).
- [ ] The run report in `.sdd/runs/*.md` includes:
  - [ ] Terminal status.
  - [ ] Loop counters and which stop rule fired (if any).
  - [ ] Short explanation of why the run stopped according to the profile.
- [ ] New unit / integration tests simulate:
  - [ ] A planner↔researcher loop (research already good; planner mis‑routes) and confirm it stops with `aborted_stuck` rather than exceeding LangGraph recursion limits.
  - [ ] A planner↔verifier loop on the same failing command (e.g. `npm test` repeatedly red) and confirm we stop after N cycles with a clear message.
  - [ ] A coder that keeps proposing identical or no‑op patches; confirm we do not keep calling coder indefinitely.

## Implementation Sketch

### 1. State Extensions

Extend `AgentState` in `src/agent/state.ts` with:

```ts
export type TerminalStatus =
  | 'done_success'
  | 'done_partial'
  | 'aborted_stuck'
  | 'aborted_constraint';

export interface LoopCounters {
  planner_to_researcher: number;
  planner_to_verifier: number;
  planner_to_coder: number;
}

export interface AgentRunState {
  // existing fields…
  terminalStatus?: TerminalStatus;
  loopCounters: LoopCounters;
  lastProgressStep?: number;
  totalSteps: number;
}
```

Define “progress” in a simple, observable way:

- file system changed (coder wrote or patched files),
- test status flipped from failing → passing for any command,
- research quality score materially improved (requires integration with research state from ticket 15),
- or ticket state changed (moved from open → closed).

### 2. Graph‑Level Stop Rules

In `src/agent/graph.ts`:

- Increment `totalSteps` each time the graph ticks.
- When routing from one node to another, increment the relevant `loopCounters` field.
- Introduce a **global recursion/step limit** that is *below* LangGraph’s hard recursion limit (e.g. 100 steps) and stop with `aborted_stuck` when exceeded.

Example (pseudo):

```ts
const MAX_STEPS = 100;
const MAX_LOOP_EDGE = 8;

if (state.totalSteps >= MAX_STEPS) {
  state.terminalStatus = state.terminalStatus ?? 'aborted_stuck';
  return 'done'; // route to END
}

if (state.loopCounters.planner_to_researcher >= MAX_LOOP_EDGE) {
  state.terminalStatus = 'aborted_stuck';
  state.snitchReason = 'planner_researcher_loop';
  return 'snitch';
}
```

### 3. Planner Logic Adjustments

Update `src/agent/prompts/planner.md` so that planner always reasons in terms of:

- **Current node outputs** (research quality, test results, code diffs),
- **Loop counters / previous attempts**, and
- **Profile + taskScope** (strict vs yolo, tiny vs large).

New instructions (high‑level):

- “If research quality is already high and you have already invoked Researcher for the same goal ≥ N times in this run, **do not** send the user back to Researcher again; either go to Coder, Verifier, or Snitch (if constraints are violated).”
- “If Verifier has returned the same failing test command and error signature ≥ N times and Coder has made no net progress, you must treat the run as stuck and either:
  - stop with a partial success if the functional goal is met (`done_partial`), or
  - escalate to Snitch (`aborted_stuck`).”

In `plannerNode` (TypeScript), read `loopCounters` and previous node outputs from state and enforce simple decision rules that *override* the LLM in hard cases:

```ts
if (state.loopCounters.planner_to_verifier >= MAX_LOOP_EDGE &&
    state.lastTestErrorSignature &&
    state.lastTestErrorSignature === state.previousTestErrorSignature) {
  state.terminalStatus = 'aborted_stuck';
  return 'snitch';
}
```

The LLM still proposes `next`, but the node can clamp impossible or looping transitions using stateful overrides.

### 4. Verifier & Coder Progress Tracking

In `src/agent/nodes/verifier.ts`:

- Compute a **test error signature** from command + first N lines of stderr.
- Compare with previous signature; if unchanged, increment a `sameErrorCount` counter on state.
- Update `loopCounters.planner_to_verifier` when planner jumps to verifier.

In `src/agent/nodes/coder.ts`:

- After tool calls, compute a simple hash over changed files or track the list of changed paths in state.
- If a coder turn results in no changes, bump a `coderNoopCount`.
- Planner must check `coderNoopCount` alongside loop counters and decide when to stop asking Coder to “fix” the same issue.

### 5. Terminal Status & Run Report

In `src/agent/run_report.ts` (or equivalent):

- Add terminal status, loop counters, and a short “stopReason” field to each run report under `.sdd/runs/`.
- Ensure Snitch writes a structured entry to `.sdd/issues.md` when we end in `aborted_stuck` or `aborted_constraint`, including:
  - the offending loop,
  - last planner reason,
  - last test command / error signature (if relevant).

## Steps

1. **Review current graph wiring and recursion behaviour**
   - [ ] Inspect `src/agent/graph.ts` and confirm all possible node transitions.
   - [ ] Identify where LangGraph recursion limits have previously been hit (logs from user).

2. **Extend AgentState**
   - [ ] Add `terminalStatus`, `loopCounters`, `lastProgressStep`, `totalSteps` to `AgentRunState`.
   - [ ] Add helpers to update `totalSteps` and mark progress when:
     - [ ] Coder applies a patch or writes a file.
     - [ ] Verifier sees a new test result or a previously failing command succeed.
     - [ ] Researcher returns a higher research‑quality score.

3. **Implement global step/loop guards**
   - [ ] In graph wiring, increment `loopCounters` and clamp transitions when thresholds are exceeded.
   - [ ] Add a MAX_STEPS guard that sets `terminalStatus='aborted_stuck'` and routes to END.

4. **Planner & Verifier integration**
   - [ ] Update `planner.md` to incorporate loop/stop semantics explicitly.
   - [ ] Update planner implementation to:
     - [ ] Read `loopCounters` and `sameErrorCount`.
     - [ ] Override LLM decisions that would keep the system in a known bad loop.
   - [ ] Update Verifier to compute and store error signatures and update `sameErrorCount`.

5. **Run report & Snitch**
   - [ ] Extend run report with terminal status, loop counters, and stop reason.
   - [ ] Ensure Snitch node reads these fields and writes a structured entry to `.sdd/issues.md`.

6. **Tests**
   - [ ] Add `test/agent/flow_stop_rules.test.ts` with scenarios for:
     - [ ] planner↔researcher loop.
     - [ ] planner↔verifier loop with repeated error.
     - [ ] coder making no progress.
   - [ ] Ensure tests assert:
     - [ ] `terminalStatus` is set correctly.
     - [ ] Loops are bounded and do not exceed the configured MAX_STEPS.

## Affected Files / Modules

- `.sdd/architect.md` (optional: add a short “Stop Rules & Loops” subsection referencing this ticket).
- `src/agent/state.ts`
- `src/agent/graph.ts`
- `src/agent/nodes/{planner.ts,researcher.ts,coder.ts,verifier.ts,snitch.ts}`
- `src/agent/run_report.ts`
- `test/agent/flow_stop_rules.test.ts` (new)

## Risks & Edge Cases

- Over‑aggressive stop rules could end runs too early, before the agent has a fair chance to fix issues. Mitigation: start with conservative thresholds and log metrics to refine them.
- Misclassification of “no progress” could miss incremental but meaningful refactorings; keep detection simple (identical error signatures + identical failing commands + no file changes).
- Interactions with existing `strict` vs `yolo` profiles must be validated; strict should still be allowed to consume more attempts than yolo.

## Non‑Goals

- This ticket does **not** redesign the full planner logic or research quality scoring (covered by other tickets). It only adds robust stop rules and loop avoidance around the existing flow.
- It does **not** introduce new nodes or multi‑agent roles; we stay within the current single‑graph structure.


