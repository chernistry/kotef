# Ticket: 43 Adaptive deep search strategy implementation

Spec version: v1.0 / kotef-deep-search-v2

## Context
- Design note: `.sdd/deep_search_and_tickets.md` — sections 3 (Target Behaviour: Adaptive Deep Search) and 6 (Planned Changes).
- Architect spec: `.sdd/architect.md` — Search & Deep Research Layer, execution profiles.
- Existing implementation:
  - `src/tools/deep_research.ts`
  - `src/tools/web_search.ts`
  - `src/tools/fetch_page.ts`

## Objective & Definition of Done
- Implement an internal `ResearchStrategy` layer in `deep_research.ts` that:
  - selects one of `none | shallow | medium | deep` for each deep research call;
  - configures `maxAttempts`, `maxResults`, `topPages`, and Tavily `search_depth` accordingly;
  - optionally uses a simple diminishing-returns check to stop early when additional attempts no longer improve quality.
- Extend `DeepResearchOptions` to accept strategy inputs but keep the external result shape unchanged.
- Ensure default behaviour stays compatible with existing tests, while enabling strategy-based tuning.

Acceptance criteria:
- `DeepResearchOptions` includes optional:
  - `taskScope?: 'tiny' | 'normal' | 'large'`;
  - `taskTypeHint?: 'reference' | 'debug' | 'architecture' | 'research'`;
  - `sddContextSnippet?: string`.
- `deepResearch` uses a new internal helper to compute:
  - strategy level;
  - `maxAttempts` (bounded ≥1);
  - `maxResults` and `topPages` per attempt;
  - Tavily `search_depth` value (`'basic'` or `'advanced'`).
- `web_search.ts` supports passing `search_depth` down to Tavily (without breaking existing call sites).
- Existing tests in `test/tools/deep_research_flow.test.ts` and `test/tools/deep_research_hardening.test.ts` still pass, with adjustments only where expectations change (e.g. additional options argument).

## Steps
1. Add strategy-related fields to `DeepResearchOptions` and update call sites to pass options structurally (no behavioural changes yet).
2. Implement `computeResearchStrategy(...)` in `src/tools/deep_research.ts`:
   - Inputs: goal, originalGoal, options (taskScope, taskTypeHint, sddContextSnippet).
   - Outputs: `{ level, maxAttempts, maxResults, topPages, searchDepth }`.
3. Wire the strategy into `deepResearch`:
   - Use `maxAttempts` from strategy instead of bare `options.maxAttempts ?? 3`.
   - Pass `maxResults` and `searchDepth` to `webSearch`.
   - Limit number of fetched pages per attempt to `topPages`.
4. Add a simple diminishing-returns check based on recent `ResearchQuality` values to stop before `maxAttempts` if improvements are negligible.
5. Update tests:
   - Ensure mocks still work with new options.
   - Add small unit tests for `computeResearchStrategy` where reasonable (e.g. tiny vs large vs architecture).

## Affected files/modules
- `src/tools/deep_research.ts`
- `src/tools/web_search.ts`
- `test/tools/deep_research_flow.test.ts`
- `test/tools/deep_research_hardening.test.ts`

## Tests
- Unit tests:
  - `npm test -- test/tools/deep_research_flow.test.ts`
  - `npm test -- test/tools/deep_research_hardening.test.ts`
- New or extended tests for strategy logic (if added as separate helper).

## Risks & Edge Cases
- Risk: increased Tavily usage/cost if strategy defaults are too aggressive.
  - Mitigation: keep conservative defaults for `fast` profile and small tasks; favour `shallow`/`medium` strategies by default.
- Risk: regressions in existing deepResearch behaviour.
  - Mitigation: rely on existing tests and add focused tests for strategy selection.

## Dependencies
- Upstream:
  - 42-deep-search-and-ticket-flow-design.md
- Downstream:
  - 44-researcher-and-prompts-integration-for-adaptive-search.md
  - 47-deep-search-and-ticket-flow-tests-and-validation.md

