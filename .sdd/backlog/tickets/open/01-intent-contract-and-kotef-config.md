# Ticket: 01 Intent Contract, KOTEF.md, and Early Exit

Spec version: v1.1 (merged with ticket 13)  
Context: Architecture review problems **#7 (Constraint ignoring)**, **#13 (No early termination)**. Research doc sections on intent preservation and goal-first DoD.

## Objective & DoD

Introduce an explicit **Intent Contract** that:
- Captures goal, constraints, appetite, non-goals, and DoD in one place
- Is derived once per run and reused across nodes
- Enables **early exit** when DoD is satisfied (merged from ticket 13)
- Is persisted for cross-run reuse

### Definition of Done

- [ ] `IntentContract` type exists and is wired into `AgentState`
- [ ] Planner builds intent contract on first pass, reuses on subsequent
- [ ] `KOTEF.md` exists under `.sdd/` for project-level policies
- [ ] Planner can **short-circuit to done** when DoD checks pass (early exit)
- [ ] Constraint violations route to snitch with `aborted_constraint`
- [ ] Intent contract persisted to `.sdd/cache/intent_contract.json`

## Implementation Sketch

### 1. IntentContract Type

```typescript
// src/agent/state.ts
export interface IntentContract {
  goal: string;
  ticketId?: string;
  appetite: 'Small' | 'Batch' | 'Big';
  nonGoals: string[];
  constraints: string[];      // "DO NOT...", "Never...", etc.
  dodChecks: string[];        // Commands/conditions for done
  forbiddenPaths?: string[];  // From KOTEF.md
}
```

### 2. Intent Contract Builder

```typescript
// src/agent/utils/intent_contract.ts
export function buildIntentContract(params: {
  goal?: string;
  ticketMarkdown?: string;
  shapedGoal?: AgentState['shapedGoal'];
  clarifiedGoal?: AgentState['clarified_goal'];
  kotefText?: string;
}): IntentContract

export function loadKotefConfig(rootDir: string): Promise<string>
export function summarizeIntent(contract: IntentContract): string
export function saveIntentContract(rootDir: string, contract: IntentContract): Promise<void>
```

**Constraint parsing (keep simple):**
- Lines starting with `DO NOT`, `Never`, `Forbidden:`, `MUST NOT`
- From goal, ticket, and KOTEF.md

### 3. Early Exit Logic (merged from ticket 13)

```typescript
// src/agent/nodes/planner.ts - at start, before LLM call

function isGoalSatisfied(state: AgentState): { done: boolean; partial: boolean; reason: string } {
  const intent = state.intentContract;
  if (!intent) return { done: false, partial: false, reason: 'No intent contract' };
  
  // Check if all DoD commands passed
  const dodPassed = intent.dodChecks.every(check => {
    const probe = state.functionalChecks?.find(fc => fc.command.includes(check));
    return probe && probe.exitCode === 0;
  });
  
  // Check no critical diagnostics
  const noCriticalErrors = !state.diagnosticsLog?.some(
    d => d.kind === 'error' && (d.source === 'build' || d.source === 'test')
  );
  
  if (dodPassed && noCriticalErrors) {
    return { done: true, partial: false, reason: 'All DoD checks passed' };
  }
  
  // Partial: some passed, non-strict profile
  if (dodPassed && state.runProfile !== 'strict') {
    return { done: false, partial: true, reason: 'DoD passed but has warnings' };
  }
  
  return { done: false, partial: false, reason: 'DoD not yet satisfied' };
}

// In plannerNode, before building prompts:
const goalStatus = isGoalSatisfied(state);
if (goalStatus.done) {
  return {
    terminalStatus: 'done_success',
    plan: { next: 'done', reason: goalStatus.reason },
    done: true
  };
}
```

### 4. Constraint Enforcement

```typescript
// After LLM decision, before returning:
if (state.intentContract) {
  const intent = state.intentContract;
  
  // Check appetite violation
  if (intent.appetite === 'Small' && decision.plan?.length > 5) {
    decision.next = 'snitch';
    decision.reason = 'Plan too broad for Small appetite';
    decision.terminalStatus = 'aborted_constraint';
  }
  
  // Check explicit constraint violation (simple substring check)
  for (const constraint of intent.constraints) {
    if (constraint.toLowerCase().includes('do not') && 
        decision.reason?.toLowerCase().includes(constraint.replace(/do not/i, '').trim())) {
      decision.next = 'snitch';
      decision.reason = `Violates constraint: ${constraint}`;
      decision.terminalStatus = 'aborted_constraint';
    }
  }
}
```

### 5. KOTEF.md Template

```markdown
# KOTEF Project Policy

## Constraints
- DO NOT rewrite entire architecture unless ticket explicitly requires it
- Prefer minimal diffs over large refactors
- Keep existing public APIs stable

## Forbidden Paths
- src/legacy/**
- infra/**

## Notes
- Tests in test/** may be freely refactored
```

### 6. Planner Prompt Updates

Add to `planner.md`:
```markdown
- Intent Contract: `{{INTENT_CONTRACT}}`

## Early Exit Rule
If all DoD checks from Intent Contract are satisfied and tests pass, you MUST set `next="done"`. Do not iterate just to "clean up" when appetite is Small.

## Constraint Enforcement
Plans violating constraints or non-goals MUST route to `snitch` with `terminalStatus="aborted_constraint"`.
```

## Steps

1. **Define types and state**
   - [ ] Add `IntentContract` to `AgentState`

2. **Implement intent_contract.ts**
   - [ ] `buildIntentContract`, `loadKotefConfig`, `summarizeIntent`, `saveIntentContract`
   - [ ] Simple regex-based constraint parsing

3. **Wire into planner**
   - [ ] Build intent contract on first pass
   - [ ] Add early exit check before LLM call
   - [ ] Add constraint enforcement after LLM decision
   - [ ] Inject `{{INTENT_CONTRACT}}` into prompt

4. **Update planner prompt**
   - [ ] Add intent contract section
   - [ ] Add early exit and constraint rules

5. **Bootstrap KOTEF.md**
   - [ ] Create template in `.sdd/KOTEF.md`

## Affected Files

- `src/agent/state.ts`
- `src/agent/utils/intent_contract.ts` (new)
- `src/agent/nodes/planner.ts`
- `src/agent/prompts/body/planner.md`
- `.sdd/KOTEF.md` (new)
- `.sdd/cache/intent_contract.json` (generated)

## Risks & Non-Goals

- **Non-goal:** Full policy engine with complex rules
- **Non-goal:** Automatic rollback on constraint violation
- **Risk:** Over-eager early exit stopping work prematurely
  - **Mitigation:** Require both DoD passed AND no critical errors
- **Risk:** Constraint parsing too aggressive
  - **Mitigation:** Start with simple substring matching, tune later

## Note on Ticket 13

Original ticket 13 (Intent-Aware Planner and Early Exit) has been **merged into this ticket** because early exit logic is fundamentally part of the Intent Contract — you can't do early exit without knowing the DoD, and DoD is part of intent.
