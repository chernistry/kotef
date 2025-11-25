# Ticket: 01 deep-research-feedback-loops

Spec version: v1.0 / architect.md

## Context
- Current research pipeline: `src/agent/graphs/sdd_orchestrator.ts` and `src/agent/nodes/researcher.ts` call `src/tools/deep_research.ts`.
- `deepResearch` now supports multi‑attempt search with:
  - LLM‑optimized search query (`search_query_optimizer.md`).
  - Per‑attempt scoring via `research_relevance_evaluator.md`.
  - Optional query refinement via `research_query_refiner.md`.
- However, this feature is new and needs hardening:
  - Thresholds for “good enough” research are heuristic.
  - We do not yet persist or expose research quality metrics to the rest of the agent.
  - Error paths (JSON parse errors, missing prompts, Tavily failures) must never break the whole run.

## Objective & Definition of Done
**Objective:** Turn the deep research pipeline into a robust, self‑checking component with up to 3 search attempts and clear quality metrics, while preserving speed on simple tasks.

**Definition of Done:**
- `deepResearch`:
  - Performs up to 3 attempts per call (initial + ≤2 refined queries) when `maxAttempts >= 3`.
  - For each attempt logs a structured research quality summary (relevance, confidence, coverage, shouldRetry, reasons).
  - Always returns a consistent `DeepResearchFinding[]`, never throws for JSON / prompt errors.
- Logging:
  - Run logs clearly show which query was chosen as “best”, how many attempts were made, and why retries stopped.
  - When Tavily returns low‑signal sources (e.g. primarily YouTube / Shutterstock), quality scores drop and at least one refined query is attempted.
- UX:
  - For small goals (e.g. “draw one HTML flag”), wall‑clock latency remains acceptable (≤ ~15–20 seconds end‑to‑end research).
  - No infinite loops or recursion errors arise from research logic.

## Steps
1. Review current implementation in `src/tools/deep_research.ts` (multi‑attempt logic, scoring, refinement).
2. Validate thresholds and heuristics:
   - Tune “good enough” criteria for relevance / coverage / confidence based on a few concrete examples (Python GUI, HTML flag, etc.).
   - Ensure `shouldRetry` is conservative but not over‑triggered.
3. Hard‑harden error handling:
   - Guarantee that missing prompts, JSON parse errors, or Tavily failures degrade gracefully to a single‑attempt, no‑score path.
   - Add unit‑style tests around the scoring/refinement helpers using a mock LLM (e.g. inject `mockMode` responses).
4. Improve logging:
   - Add structured log fields (`attempt`, `query`, `relevance`, `coverage`, `confidence`, `shouldRetry`) and final chosen query summary.
   - Verify logs by running `bin/kotef run` on 2–3 sample goals and inspecting `.sdd/runs/*.md`.
5. Document the behaviour:
   - Briefly document the research feedback loop in `README.md` and/or a short `docs/research.md` section, including how it interacts with `--yolo` and `maxWebRequestsPerRun`.

## Affected files/modules
- `src/tools/deep_research.ts`
- `src/tools/web_search.ts` (if small adjustments are needed).
- `src/agent/graphs/sdd_orchestrator.ts`
- `src/agent/nodes/researcher.ts`
- Optional docs: `README.md` or `docs/research.md`.

## Tests
- Add focused tests (or script‑driven checks) that:
  - Simulate high‑quality search results and verify that only 1 attempt is used.
  - Simulate low‑quality results (e.g. all YouTube/stock links) and verify that refinement is triggered at least once.
  - Confirm that Tavily 4xx/5xx errors result in no throw and a safe empty `DeepResearchFinding[]`.

## Risks & Edge Cases
- Over‑eager retries could slow down runs with limited benefit.
- Too strict thresholds could cause retries even when first‑pass results are good.
- Excessive logging may clutter output; keep structured but concise.

## Dependencies
- Upstream: base deep research + query optimizer already implemented.
- Downstream: Ticket 02 (exposing research quality to planner) and Ticket 03 (prompt hardening) can build on this.


