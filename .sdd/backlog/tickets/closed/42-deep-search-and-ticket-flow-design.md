# Ticket: 42 Deep search and ticket flow design update

Spec version: v1.0 / kotef-deep-search-v2

## Context
- Project SDD: `.sdd/architect.md` — sections:
  - Search & Deep Research Layer.
  - Ticket Lifecycle (9.3) and Run Report ↔ Ticket Linkage (9.4).
- Design note: `.sdd/deep_search_and_tickets.md` — current analysis and target behaviour for:
  - deep web search / deep research;
  - ticket lifecycle and task size semantics.

## Objective & Definition of Done
- Produce a concise, implementation-oriented design for:
  - adaptive deep search strategy (depth/width based on task type, TaskScope, SDD context, and uncertainty);
  - ticket lifecycle semantics (open → closed, visibility in run reports);
  - ticket requirement rules for small/medium/large tasks.
- Ensure the design:
  - is captured in `.sdd/deep_search_and_tickets.md`;
  - is consistent with `.sdd/architect.md` (does not contradict existing principles);
  - defines clear boundaries for subsequent implementation tickets (43–47);
  - includes an explicit mapping between “small/medium/large” and `TaskScope` (`tiny/normal/large`).

Acceptance criteria:
- `.sdd/deep_search_and_tickets.md` exists and describes:
  - current deep search behaviour and how it differs from `algorhytm.md`;
  - target adaptive depth algorithm and stopping criteria;
  - chosen architecture variant (meta-agent vs specialised prompts) and justification;
  - desired ticket lifecycle behaviour and size-based ticket requirements.
- All implementation work for deep search/ticket flow is deferred to separate tickets and referenced from this design.

## Steps
1. Analyse current deep search implementation (`src/tools/deep_research.ts`, `src/tools/web_search.ts`, `src/agent/nodes/researcher.ts`, prompts in `src/agent/prompts/body/*`).
2. Compare behaviour with `allthedocs/learning/research/web_search/algorhytm.md` and extract key gaps.
3. Draft design in `.sdd/deep_search_and_tickets.md`:
   - adaptive strategy levels (`none`, `shallow`, `medium`, `deep`);
   - inputs (TaskScope, task type, SDD context, ResearchQuality) and stop rules.
4. Specify desired ticket lifecycle and task size rules, aligned with `.sdd/architect.md` §9.3–9.4.
5. Link this ticket and downstream tickets (43–47) from the design note for traceability.

## Affected files/modules
- `.sdd/deep_search_and_tickets.md`
- `.sdd/architect.md` (read-only reference; no changes expected in this ticket)

## Tests
- No automated tests for this ticket.
- Manual check:
  - Design note is present and readable.
  - Design covers all bullet points from “ТРЕБОВАНИЯ К ГЛУБОКОМУ ПОИСКУ” and “ФЛОУ С ТИКЕТАМИ: ПРОБЛЕМЫ И ТРЕБОВАНИЯ”.

## Risks & Edge Cases
- Risk: over-design compared to current implementation capacity.
  - Mitigation: keep design scoped to what can be implemented via tickets 43–47.
- Risk: divergence from `.sdd/architect.md` long-term.
  - Mitigation: treat architect.md as primary; this design must remain compatible.

## Dependencies
- Upstream: none.
- Downstream:
  - 43-adaptive-deep-search-strategy-implementation.md
  - 44-researcher-and-prompts-integration-for-adaptive-search.md
  - 45-ticket-lifecycle-open-to-closed-and-run-reporting.md
  - 46-ticket-requirement-for-medium-and-large-tasks.md
  - 47-deep-search-and-ticket-flow-tests-and-validation.md

