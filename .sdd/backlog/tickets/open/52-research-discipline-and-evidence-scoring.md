# Ticket: 52 Research discipline and evidence scoring

Spec version: v1.0 / kotef-sd-approaches-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — deep research and grounding requirements.
- SD-approaches context:
  - `.sdd/context/sd_approaches.md` — sections 1.1 (Flow/DevEx: small, reversible changes), 1.3 (Testing/reliability/observability), 3.6 (“Research discipline”), 2 (phases involving research and design).
- Existing implementation:
  - `src/tools/deep_research.ts`:
    - multi-attempt search with relevance/coverage/confidence scoring;
    - query refinement via `research_query_refiner` and `search_query_optimizer` prompts.
  - `src/agent/nodes/researcher.ts` and `src/agent/prompts/body/researcher.md`:
    - return structured findings (`queries`, `findings`, `risks`, `ready_for_coder`, `reason`).
  - Planner already uses `researchQuality` to avoid loops and low-quality research (Ticket 15).

Gaps vs sd_approaches:
- No explicit tracking of **source diversity**, **recency**, or **disagreement** between sources.
- No minimum “triangulation” discipline (e.g. ≥3 independent sources).
- No explicit distinction between **strongly supported** facts vs speculative ones in downstream decisions.

## Objective & Definition of Done

Objective:
- Strengthen the web-research pipeline so that:
  - it enforces basic research discipline (multiple, diverse, recent sources);
  - it surfaces structured evidence scores (support, recency, diversity, conflict) to Planner and Coder;
  - it uses these scores to decide when implementation is safe vs when to stop or ask for human input.

### Definition of Done

- Deep research scoring:
  - [ ] `DeepResearchFinding` and `DeepResearchResult` are extended to capture:
    - [ ] `support_strength` (0–1 or Low/Medium/High) based on number/quality of agreeing sources;
    - [ ] `recency_score` (e.g. based on publication date or URL cues; at least coarse `old` vs `recent`);
    - [ ] `source_diversity` (spread across domains/vendors, not just one blog/forum);
    - [ ] any detected **conflicts** between sources for a statement.
  - [ ] `deepResearch` computes and returns aggregate scores such as:
    - [ ] `overall_support`, `overall_recency`, `overall_diversity`, and `has_conflicts`.
- Researcher behaviour:
  - [ ] Researcher prompt and node logic are updated so that:
    - [ ] for non-tiny, non-yolo tasks, it aims for at least 3 distinct sources for key questions, unless high-confidence official docs exist;
    - [ ] it marks findings as “speculative” if support_strength is low or sources conflict;
    - [ ] it writes a short `risks` note when relying on low-confidence/higher-variance sources (e.g. old forum posts).
- Planner gating:
  - [ ] Planner uses enhanced `researchQuality` to:
    - [ ] block `strict` profile implementation when:
      - `overall_support` or `overall_recency` is below a threshold and the change is high-risk;
    - [ ] allow `fast`/`smoke` profiles to proceed with a warning when:
      - the area is low-risk and confidence is moderate.
  - [ ] For blocked cases, Planner:
    - [ ] records a clear reason in plan (`reason: research_insufficient`),
    - [ ] optionally creates a ticket requesting human-supplied sources or domain confirmation.

## Implementation Sketch

### 1. Extend research data structures

- In `src/tools/deep_research.ts`:
  - Extend `DeepResearchFinding`:

```ts
export interface DeepResearchFinding {
  statement: string;
  citations: { url: string; title?: string; snippet?: string }[];
  support_strength?: number; // 0–1
  recency_score?: number;    // 0–1, higher = more recent
  source_diversity?: number; // 0–1
  conflicts?: string[];      // short notes if sources disagree
}
```

  - Extend quality metrics to include:
    - `support`, `recency`, `diversity`, `hasConflicts`.

### 2. LLM prompts for scoring

- Update or add a small prompt for scoring research findings (can reuse `research_relevance_evaluator` or add a dedicated one) to:
  - derive `support_strength`, `recency_score`, `source_diversity`, and `conflicts` for a set of findings;
  - return strictly valid JSON for use in `deep_research.ts`.

### 3. Researcher node & prompt updates

- `src/agent/nodes/researcher.ts` and `src/agent/prompts/body/researcher.md`:
  - Instruct the Researcher to:
    - favour official docs / vendor sources when available;
    - include multiple independent sources otherwise;
    - attach evidence-scoring fields to `findings` in its JSON output (or point to `DeepResearchResult` from `deepResearch`).
  - Make `risks` explicitly mention:
    - low support, old sources, or conflicts.

### 4. Planner gating logic

- `plannerNode`:
  - When `state.researchQuality` includes new fields (`support`, `recency`, `diversity`, `hasConflicts`):
    - incorporate them into decisions:
      - e.g. require `support >= 0.7` and `recency >= 0.6` for `strict` implementation of risky changes;
      - if `hasConflicts === true`, prefer to:
        - either gather more research, or
        - stop with `terminalStatus='aborted_stuck'` and a Snitch entry requesting human guidance.

## Steps

1. **Data model & prompts**
   - [ ] Extend `DeepResearchFinding` and quality types.
   - [ ] Add/update prompts for evidence scoring.
2. **Implementation updates**
   - [ ] Implement scoring calculation in `deep_research.ts`.
   - [ ] Update Researcher node and prompt to surface these fields.
3. **Planner logic**
   - [ ] Update planner to consult new quality signals when deciding `next` and `profile`.
4. **Tests**
   - [ ] Extend `deep_research_*` tests to cover support/recency/diversity/conflicts.
   - [ ] Add planner tests to ensure low-quality research leads to blocked/partial outcomes in strict mode.

## Affected files / modules
- `src/tools/deep_research.ts`
- `src/agent/nodes/researcher.ts`
- `src/agent/prompts/body/researcher.md`
- `src/agent/nodes/planner.ts`
- Tests under `test/tools/deep_research_*` and `test/agent/planner_*`.

## Risks & Edge Cases
- Overly strict thresholds might block useful work in niche areas with little documentation.
  - Mitigation: allow relaxed thresholds for low-impact tasks or yolo/smoke profiles.
- LLM-based scoring can be noisy.
  - Mitigation: use coarse bands and conservative thresholds; prefer clear “insufficient evidence” over false precision.

## Dependencies
- Upstream:
  - 15-web-research-and-search-query-optimization.md
  - 39-llm-tool-call-json-robustness-and-researcher-plan-fallbacks.md
- Related:
  - 50-adr-and-assumptions-log.md (assumptions derived from low-confidence research).

