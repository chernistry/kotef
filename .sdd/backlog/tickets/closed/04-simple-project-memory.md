# Ticket: 04 Simple Project Memory Cache

Spec version: v1.1 (simplified from v1.0)  
Context: Architecture review problem **#11 (No cross-run memory)**, best practices doc (long-term memory should be simple). Depends on ticket **01 Intent Contract**.

## Objective & DoD

Create a **minimal** project memory layer so kotef can:
- Persist key outcomes across runs (what worked, what failed)
- Avoid repeating the same mistakes
- Load previous context without complex artifact systems

**Explicitly NOT doing:**
- Complex artifact types/schemas
- Separate artifact files
- Sophisticated memory retrieval

### Definition of Done

- [ ] Simple `project_memory.json` file in `.sdd/cache/` with flat structure
- [ ] Planner loads previous run summaries on startup
- [ ] Retrospective appends a short summary after each run
- [ ] Memory is human-readable and editable

## Implementation Sketch

### 1. Simple Memory Structure

```typescript
// In src/agent/utils/project_memory.ts
interface RunSummary {
  timestamp: string;
  ticketId?: string;
  goal: string;
  outcome: 'success' | 'partial' | 'failed';
  lesson: string;  // One-line lesson learned
}

interface ProjectMemory {
  runs: RunSummary[];  // Keep last 10-20
  notes: string[];     // Manual notes (optional)
}
```

**No complex artifact types.** Just runs and lessons.

### 2. Memory Utilities

```typescript
// src/agent/utils/project_memory.ts
export async function loadProjectMemory(rootDir: string): Promise<ProjectMemory | null>
export async function appendRunSummary(rootDir: string, summary: RunSummary): Promise<void>
export function formatMemoryForPrompt(memory: ProjectMemory, maxLines: number = 5): string
```

### 3. Integration Points

**Planner (on startup):**
```typescript
const memory = await loadProjectMemory(cfg.rootDir);
const memoryContext = memory ? formatMemoryForPrompt(memory, 5) : '';
replacements['{{PROJECT_MEMORY}}'] = memoryContext;
```

**Retrospective (on completion):**
```typescript
await appendRunSummary(cfg.rootDir, {
  timestamp: new Date().toISOString(),
  ticketId: state.sdd.ticketId,
  goal: state.sdd.goal?.slice(0, 100),
  outcome: state.terminalStatus === 'done_success' ? 'success' : 
           state.terminalStatus === 'done_partial' ? 'partial' : 'failed',
  lesson: extractLesson(state)  // One line from retrospective
});
```

### 4. Example `project_memory.json`

```json
{
  "runs": [
    {
      "timestamp": "2025-11-28T10:00:00Z",
      "ticketId": "08-intent-contract",
      "goal": "Add IntentContract to planner",
      "outcome": "success",
      "lesson": "Keep constraint parsing simple, regex works fine"
    },
    {
      "timestamp": "2025-11-28T11:00:00Z",
      "ticketId": "09-memory",
      "goal": "Add project memory",
      "outcome": "partial",
      "lesson": "Tests flaky on CI, works locally"
    }
  ],
  "notes": []
}
```

## Steps

1. **Create memory utility**
   - [ ] Add `src/agent/utils/project_memory.ts` with load/append/format functions
   - [ ] Keep structure flat and simple

2. **Wire into planner**
   - [ ] Load memory at planner start
   - [ ] Add `{{PROJECT_MEMORY}}` to planner prompt

3. **Wire into retrospective**
   - [ ] Extract one-line lesson from retrospective output
   - [ ] Append to memory file

4. **Add to planner prompt**
   - [ ] Update `planner.md` with memory section

## Affected Files

- `src/agent/utils/project_memory.ts` (new, ~50 lines)
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/retrospective.ts`
- `src/agent/prompts/body/planner.md`
- `.sdd/cache/project_memory.json` (generated)

## Risks & Non-Goals

- **Non-goal:** Complex artifact system with types, IDs, data paths
- **Non-goal:** Semantic search over memory
- **Non-goal:** Cross-project learning
- **Risk:** Memory file grows too large
  - **Mitigation:** Keep only last 20 runs, prune on load

## Why Simplified

Original ticket proposed complex `Artifact` types with IDs, timestamps, data paths, and multiple artifact types. This is overengineering for a solo developer project. Simple JSON with run summaries achieves 80% of the value with 20% of the complexity.
