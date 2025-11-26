# Ticket: 44 Researcher node and prompts integration for adaptive deep search

Spec version: v1.0 / kotef-deep-search-v2

## Context
- Design note: `.sdd/deep_search_and_tickets.md` — sections 3.2–3.4 and 6 (Deep search architecture choice and planned changes).
- Implementation from Ticket 43:
  - `ResearchStrategy` in `src/tools/deep_research.ts`.
- Existing research orchestration:
  - `src/agent/nodes/researcher.ts`
  - `src/agent/prompts/body/researcher.md`
  - `src/agent/prompts/body/search_query_optimizer.md`
  - `src/agent/prompts/body/research_query_refiner.md`
  - `src/agent/prompts/body/research_relevance_evaluator.md`

## Objective & Definition of Done
- Make `researcherNode` aware of task size and type so that:
  - it passes appropriate strategy hints into `deepResearch`;
  - it uses `deepResearch` not only because `profile === 'strict'` but also when the task is large/architectural/research-like;
  - it keeps shallow search for small or simple tasks.
- Ensure prompts explicitly encode:
  - task size semantics (`tiny` vs `normal` vs `large`);
  - when deep research is warranted vs when shallow or no web search is preferred.

Acceptance criteria:
- `researcherNode`:
  - derives a simple `taskTypeHint` from goal/ticket text (reference/debug/architecture/research) using string heuristics;
  - passes `taskScope`, `taskTypeHint` and a small SDD context snippet (`architect`/`best_practices` summary) into `deepResearch` options;
  - chooses between:
    - no web search (rare, only when clearly unnecessary),
    - shallow `webSearch` calls,
    - deep research via `deepResearch`, based on TaskScope + profile + taskType.
- `researcher.md`:
  - mentions that:
    - `tiny` tasks and obvious answers should avoid deep dives;
    - architectural / research tasks with `normal`/`large` scope should explicitly favour deep research with quality scoring, while respecting budgets.
- Existing caller (`sdd_orchestrator.ts`) maps SDD bootstrap use-case to an appropriate strategy (likely deep, architecture/research).

## Steps
1. Extend `researcherNode` to compute a `taskTypeHint` from `state.sdd.goal`/`state.sdd.ticket` (keywords like “architecture”, “design”, “error”, “stack trace”, “how to”, “vs”).
2. When invoking `deepResearch`, pass:
   - `taskScope: state.taskScope`;
   - `taskTypeHint`;
   - `sddContextSnippet` (short slice of architect/best_practices that is relevant or at least summarised).
3. Refine decision logic:
   - For `TaskScope = 'tiny'` → favour shallow search or no search, except on explicit planner request.
   - For `TaskScope = 'normal'`/`'large'` and taskType ∈ {architecture, research} → prefer `deepResearch`.
   - For `debug` tasks → start with shallow search around the error, escalate to deep only when coverage stays low.
4. Update `researcher.md` and, if needed, helper prompts so that:
   - they describe the intended strategy levels and when to use deep vs shallow;
   - they mention not to over-expand research for tiny tasks.
5. Sanity-check behaviour on:
   - a small coding question (expect no or shallow deepResearch);
   - an architectural/spec question (expect deepResearch calls).

## Affected files/modules
- `src/agent/nodes/researcher.ts`
- `src/agent/prompts/body/researcher.md`
- `src/agent/graphs/sdd_orchestrator.ts` (may pass taskScope/taskType hints) 

## Tests
- Extend or add tests around `researcherNode` to:
  - verify that `deepResearch` is invoked with strategy hints for large/architectural tasks;
  - ensure tiny tasks still go through shallow search paths.
- Manual validation:
  - run `kotef` on small vs complex goals and inspect logs for `deep-research` logger output.

## Risks & Edge Cases
- Risk: over-using deep research and increasing latency/cost.
  - Mitigation: use conservative heuristics; require both non-tiny scope and research/architecture type before escalating.
- Risk: misclassification of tasks.
  - Mitigation: rely on simple keyword rules and keep fallback behaviour safe (default to shallow, not deep).

## Dependencies
- Upstream:
  - 42-deep-search-and-ticket-flow-design.md
  - 43-adaptive-deep-search-strategy-implementation.md
- Downstream:
  - 47-deep-search-and-ticket-flow-tests-and-validation.md

