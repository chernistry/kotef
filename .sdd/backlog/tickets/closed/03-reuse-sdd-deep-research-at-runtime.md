# Ticket: 03 Reuse SDD Deep Research at Runtime

Spec version: v1.0  
Context: SDD orchestrator in `src/agent/graphs/sdd_orchestrator.ts`, runtime researcher in `src/agent/nodes/researcher.ts`, deep research tool in `src/tools/deep_research.ts`, `.sdd/context/deep_research_*.json`. Targets architecture review problem **#10 (Research duplication)**.

## Objective & DoD

Avoid paying twice for the same web research by:

- reusing SDD orchestration deep‑research outputs in runtime runs when the goal/ticket overlaps;
- surfacing SDD research into `state.researchResults`/`researchQuality` with a clear `source: 'sdd'` marker;
- letting planner/researcher skip redundant web calls when SDD research is “good enough”.

### Definition of Done

- [ ] SDD orchestrator writes a **normalized research cache** file (or reuses existing `deep_research_*.json`) with:
  - a canonical `goal` string,
  - `findings`,
  - `quality` (if available).
- [ ] Runtime `researcherNode` can load and use this cache for goals/tickets that match or are clearly derived from the SDD goal.
- [ ] When SDD research is reused, `state.researchResults` gets populated and `state.researchQuality` is set with `shouldRetry = false`, `lastQuery` set to the cached query, and a `source: 'sdd'` note stored in `researchResults`.
- [ ] Planner treats `source: 'sdd'` research as already satisfied and does **not** loop to `researcher` unless goal/intent explicitly changed.

## Implementation Sketch

### 1. Normalized Research Cache Writer

- In `sddResearch` within `src/agent/graphs/sdd_orchestrator.ts`:
  - After successful `deepResearch` call, in addition to raw `deep_research_<hash>.json`, write a small normalized cache, e.g. `.sdd/cache/research_cache.json`:

    ```ts
    interface ResearchCacheEntry {
      goal: string;
      query: string;
      findings: DeepResearchFinding[];
      quality?: DeepResearchResult['quality'];
      updatedAt: number;
    }
    ```

  - For now, keep a single entry per project (latest run); structure can be an array for future expansion.

### 2. Research Cache Loader

- Add a new helper `src/agent/utils/research_cache.ts`:
  - `loadResearchCache(rootDir: string): Promise<ResearchCacheEntry[] | null>`.
  - `matchGoalToCache(goal: string, entries: ResearchCacheEntry[]): ResearchCacheEntry | null`:
    - Use a simple heuristic (1–4h scope): consider it a match if:
      - goals are identical, or
      - the ticket’s goal text contains the SDD goal as a substring, or vice versa, OR
      - both share the same ticket ID prefix (if encoded in goal).

### 3. Researcher: Reuse Before Hitting Web

- In `src/agent/nodes/researcher.ts`:
  - At the start, before building prompts:
    - Load cache via `loadResearchCache(cfg.rootDir || process.cwd())`.
    - If there is a matching entry for `state.sdd.goal` (or derived goal), and no explicit user request for “fresh research”:
      - Populate:

        ```ts
        state.researchResults = {
          source: 'sdd',
          findings: entry.findings
        };
        state.researchQuality = entry.quality || undefined;
        ```

      - Log that SDD research is being reused and **short‑circuit** to return this state without calling `deepResearch` again.

  - When offline mode is enabled, prefer cache if available before returning the “offline” placeholder.

### 4. Planner: Respect `source: 'sdd'`

- In `src/agent/nodes/planner.ts` and `src/agent/prompts/body/planner.md`:
  - Ensure the “Research‑first policy” section treats `RESEARCH_RESULTS.source === "sdd"` as “already researched for this goal”.
  - In planner code, before routing to `researcher`, check:

    ```ts
    const rr: any = state.researchResults;
    if (rr && rr.source === 'sdd') {
      // Do not route back to researcher unless constraints explicitly require fresh web research.
    }
    ```

  - Keep behaviour conservative: allow additional research only when the ticket/goals clearly diverge from cached SDD goal (future ticket can refine this).

## Steps

1. **Cache writer**
   - [ ] Extend `sddResearch` to write/update `.sdd/cache/research_cache.json` with normalized entries.
2. **Cache loader utility**
   - [ ] Implement `src/agent/utils/research_cache.ts` with load/match helpers.
3. **Researcher integration**
   - [ ] Use research cache at the top of `researcherNode` and short‑circuit when a good match exists.
4. **Planner adjustments**
   - [ ] Update planner logic and prompt to treat `source: 'sdd'` research as sufficient by default and avoid redundant loops into `researcher`.

## Affected Files

- `src/agent/graphs/sdd_orchestrator.ts`
- `src/agent/nodes/researcher.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/prompts/body/planner.md`
- `src/agent/utils/research_cache.ts` (new)
- `.sdd/cache/research_cache.json` (new, generated)

## Risks & Non‑Goals

- **Risk:** Reusing stale research when the project has significantly changed.  
  **Mitigation:** Keep only a single latest entry and log when cache is older than N days; user can delete cache to force refresh.
- **Non‑goal:** Full semantic equivalence checking between goals; we only use simple textual heuristics in this ticket.

