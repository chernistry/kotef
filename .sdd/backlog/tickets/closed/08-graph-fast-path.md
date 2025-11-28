# Ticket: 08 Graph Fast Path for Simple Changes

Spec version: v1.0  
Context: Architecture review problem **#9 (Excessive cycles)**, best practices doc (dynamic re-planning, single-agent simplicity).

## Problem Statement

Current graph is rigid:
```
coder → verifier (ALWAYS)
verifier → planner (ALWAYS, even if everything passed)
planner → decides next step
```

This means even a trivial one-line fix goes through:
1. Planner LLM call (decide to code)
2. Coder execution
3. Verifier runs tests
4. Planner LLM call (decide if done)
5. Maybe more cycles...

For simple changes, this is overkill. Modern agents use adaptive verification based on change size/risk.

## Objective & DoD

Add a **fast path** that skips unnecessary cycles for low-risk changes.

### Definition of Done

- [ ] Verifier can route directly to `done` for trivial changes (skip planner re-evaluation)
- [ ] "Trivial change" defined by: ≤3 files changed, all tests pass, no new errors
- [ ] Fast path only active for `smoke` and `yolo` profiles
- [ ] `strict` and `fast` profiles unchanged (always go through planner)
- [ ] Reduces LLM calls by ~30% for simple tasks

## Implementation Sketch

### 1. Verifier Fast Path Logic

```typescript
// src/agent/nodes/verifier.ts

// After running tests, before returning:
const canFastPath = 
  (state.runProfile === 'smoke' || state.runProfile === 'yolo') &&
  Object.keys(state.fileChanges || {}).length <= 3 &&
  testResults.passed &&
  !state.diagnosticsLog?.some(d => d.kind === 'error');

if (canFastPath) {
  log.info('Fast path: skipping planner re-evaluation');
  return {
    ...state,
    done: true,
    terminalStatus: 'done_success',
    plan: { next: 'done', reason: 'Fast path: tests passed, minimal changes' }
  };
}

// Otherwise, normal flow to planner
```

### 2. Graph Edge Update

```typescript
// src/agent/graph.ts

graph.addConditionalEdges(
  "verifier",
  (state) => {
    // Fast path: verifier already set done=true
    if (state.done && state.terminalStatus === 'done_success') {
      const ticketPath = state.sdd?.ticketPath;
      return ticketPath ? 'ticket_closer' : 'end';
    }
    
    // Normal path: back to planner
    return 'planner';
  },
  {
    planner: "planner",
    ticket_closer: "ticket_closer",
    end: END
  }
);
```

### 3. Profile-Based Thresholds

```typescript
// src/agent/utils/fast_path.ts

interface FastPathConfig {
  maxFilesChanged: number;
  requireTestsPass: boolean;
  requireNoErrors: boolean;
}

const FAST_PATH_CONFIG: Record<string, FastPathConfig | null> = {
  strict: null,  // No fast path
  fast: null,    // No fast path
  smoke: { maxFilesChanged: 3, requireTestsPass: true, requireNoErrors: true },
  yolo: { maxFilesChanged: 5, requireTestsPass: false, requireNoErrors: false }
};

export function canUseFastPath(state: AgentState): boolean {
  const config = FAST_PATH_CONFIG[state.runProfile || 'fast'];
  if (!config) return false;
  
  const filesChanged = Object.keys(state.fileChanges || {}).length;
  if (filesChanged > config.maxFilesChanged) return false;
  if (config.requireTestsPass && !state.testResults?.passed) return false;
  if (config.requireNoErrors && state.diagnosticsLog?.some(d => d.kind === 'error')) return false;
  
  return true;
}
```

## Steps

1. **Add fast path utility**
   - [ ] Create `src/agent/utils/fast_path.ts` with config and check function

2. **Update verifier**
   - [ ] Add fast path check after test execution
   - [ ] Set `done=true` and `terminalStatus` when fast path applies

3. **Update graph edges**
   - [ ] Verifier can route to `ticket_closer` or `end` directly

4. **Test scenarios**
   - [ ] Verify fast path triggers for small changes in smoke/yolo
   - [ ] Verify fast path does NOT trigger in strict/fast profiles
   - [ ] Verify fast path does NOT trigger when tests fail

## Affected Files

- `src/agent/utils/fast_path.ts` (new, ~30 lines)
- `src/agent/nodes/verifier.ts`
- `src/agent/graph.ts`

## Risks & Non-Goals

- **Risk:** Fast path skips important verification
  - **Mitigation:** Only for smoke/yolo, requires tests pass (for smoke)
- **Non-goal:** Changing strict/fast profile behavior
- **Non-goal:** Removing planner entirely (just adding a shortcut)

## Why This Matters

For a solo developer doing quick fixes, waiting for multiple LLM round-trips is frustrating. Fast path makes `kotef run --profile smoke` feel responsive for simple tasks while keeping thorough verification for complex work.

## Dependencies

- Independent of other tickets
- Can be implemented anytime after core graph is stable
