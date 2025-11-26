# Ticket: 47 Deep search and ticket flow tests and validation

Spec version: v1.0 / kotef-deep-search-and-tickets-v2

## Context
- Design note:
  - `.sdd/deep_search_and_tickets.md` — overall design for deep search and ticket lifecycle.
- Implementation tickets:
  - 43-adaptive-deep-search-strategy-implementation.md
  - 44-researcher-and-prompts-integration-for-adaptive-search.md
  - 45-ticket-lifecycle-open-to-closed-and-run-reporting.md
  - 46-ticket-requirement-for-medium-and-large-tasks.md

## Objective & Definition of Done
- Validate that:
  - deep search behaves adaptively (small vs large tasks, reference vs architecture/debug);
  - ticket lifecycle (open → closed) and ticket requirement semantics are correctly enforced and visible.
- Ensure a minimal but meaningful test harness exists for these behaviours.

Acceptance criteria:
- Tests cover:
  - deepResearch strategy selection for different `taskScope` / `taskTypeHint` combinations (unit-level where possible);
  - researcher integration: deep vs shallow behaviour for strict vs fast profiles and tiny vs large tasks;
  - ticket lifecycle:
    - tickets move open → closed on successful completion;
    - run reports include `ticketId`, `ticketPath`, `ticketStatus`;
  - CLI gating behaviour for `kotef run --goal` in SDD projects with and without open tickets.
- All added tests pass locally.

## Steps
1. Extend unit tests for deep research:
   - Add tests for `computeResearchStrategy` (if it exists) or equivalent helper.
   - Verify calls to `webSearch` respect `maxResults` and (mocked) `search_depth` choice.
2. Add/extend tests around `researcherNode`:
   - Mock `deepResearch` and assert it is called or skipped based on taskScope/profile/type.
3. Expand ticket lifecycle tests:
   - Extend `test/agent/tickets_lifecycle.test.ts` or add new tests to cover:
     - CLI-based execution updating run reports with ticket metadata.
4. Add tests (or scripted manual scenarios) for CLI ticket requirement:
   - Simulate `.sdd/` with/without open tickets and verify `kotef run --goal` behaviour.
5. Run the full test suite (or at least relevant subsets) and document any remaining limitations.

## Affected files/modules
- `test/tools/deep_research_flow.test.ts`
- `test/tools/deep_research_hardening.test.ts`
- New or extended tests under:
  - `test/agent/`
  - `test/cli/` (if created)

## Tests
- `npm test` (or focused subsets) should pass after changes from tickets 43–46.

## Risks & Edge Cases
- Risk: tests become too coupled to internal heuristics.
  - Mitigation: assert on high-level behaviour (relative differences) rather than exact numeric thresholds wherever possible.

## Dependencies
- Upstream:
  - 43-adaptive-deep-search-strategy-implementation.md
  - 44-researcher-and-prompts-integration-for-adaptive-search.md
  - 45-ticket-lifecycle-open-to-closed-and-run-reporting.md
  - 46-ticket-requirement-for-medium-and-large-tasks.md

