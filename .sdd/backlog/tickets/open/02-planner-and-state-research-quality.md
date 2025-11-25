# Ticket: 02 planner-and-state-research-quality

Spec version: v1.0 / architect.md

## Context
- `deepResearch` can now internally score research attempts (relevance, confidence, coverage) and refine queries.
- The agent graph (`src/agent/graph.ts`) currently treats `researchResults` as either:
  - an array of `DeepResearchFinding`, or
  - an object with `{ source: 'sdd', note: string }`, or
  - an error object.
- The `planner` node decides whether to:
  - go back to `researcher`, or
  - proceed to `coder` / `verifier`, based on simple presence/absence of `researchResults`.
- Planner has no visibility into how strong or weak the research actually is, which can produce:
  - overconfident coding on weak research, or
  - pointless research loops without a clear “give up” condition.

## Objective & Definition of Done
**Objective:** Expose research quality metrics to planner/agent state so that planning decisions can distinguish between strong, weak, or absent research and stop cleanly when further web search is unlikely to help.

**Definition of Done:**
- Agent state (`AgentState`) gains a `researchQuality` field (or similar) with:
  - last query used,
  - relevance / coverage / confidence scores (if available),
  - a short human‑readable notes string.
- `researcher` node:
  - Populates `researchQuality` for each successful deep research call (falling back to `null` when scoring fails).
  - Sets a flag when research is “strong enough” vs “weak/low‑confidence”.
- `planner` node:
  - Uses `researchQuality` in its prompt and edges:
    - If research is strong → it should *not* bounce back to `researcher` unless the goal fundamentally changed.
    - If research is weak after N attempts → route to `snitch` / `ask_human` with a clear issue entry (“Web research inconclusive for this goal…”).
  - Handles the case where only `.sdd/best_practices.md` exists but is stale or low quality by allowing an explicit “force re‑research” path in future tickets.

## Steps
1. Extend `AgentState` in `src/agent/state.ts` with a `researchQuality` field (typed, optional).
2. Update `researcherNode` (`src/agent/nodes/researcher.ts`) to:
   - Capture and propagate the best attempt’s quality from `deepResearch` (if available) into `state.researchQuality`.
   - Ensure legacy callers (that rely on `researchResults` only) remain compatible.
3. Update `planner` prompt (`src/agent/prompts/planner.md`) and implementation to:
   - Include a short structured summary of `researchQuality` in the system/user context.
   - Explicitly reason about whether additional research is worth it.
4. Update planner edge logic in `src/agent/graph.ts` so that:
   - It avoids infinite `planner ↔ researcher` loops when `researchQuality` says “weak but retries exhausted”.
   - It routes to `snitch` with a descriptive message when research is weak and max attempts are reached.
5. Add logging:
   - Log `researchQuality` when planner makes a decision that depends on it (e.g. “proceed to coder despite medium coverage”).

## Affected files/modules
- `src/agent/state.ts`
- `src/agent/nodes/researcher.ts`
- `src/agent/graph.ts`
- `src/agent/prompts/planner.md`
- (indirectly) `src/tools/deep_research.ts`

## Tests
- Add targeted tests or scripted runs that:
  - Simulate strong research and verify planner goes to `coder` (no loops).
  - Simulate persistently weak research and verify planner routes to `snitch` with an appropriate issue.
  - Confirm that existing flows without research scoring behave as before when `researchQuality` is absent.

## Risks & Edge Cases
- Overfitting planner behaviour to noisy quality scores could cause premature “give up” decisions.
- Too much context about research scores in the planner prompt may increase token usage; keep summaries short.

## Dependencies
- Depends on Ticket 01 (feedback loops and quality scores in `deepResearch`) being stable.
- Downstream: general flow/UX improvements and CI evaluation of planner behaviour.


