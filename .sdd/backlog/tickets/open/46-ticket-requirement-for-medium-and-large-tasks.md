# Ticket: 46 Ticket requirement for medium and large tasks

Spec version: v1.0 / kotef-ticket-lifecycle-v2

## Context
- Architect spec:
  - `.sdd/architect.md` — SDD-nativity and ticket lifecycle.
- Design note:
  - `.sdd/deep_search_and_tickets.md` — sections 3.1 (Task Size Categories) and 5.3 (Target Ticket Behaviour).
- Existing code:
  - `src/agent/task_scope.ts`
  - `src/cli.ts` (run + chat commands)
  - `src/agent/prompts/body/meta_agent.md`
  - `src/agent/prompts/body/planner.md`

## Objective & Definition of Done
- Enforce the rule:
  - **Medium and large tasks (TaskScope = 'normal' or 'large') must use tickets in SDD-backed projects.**
- Ensure:
  - Running `kotef` against a project with `.sdd/` and a non-tiny goal:
    - does not silently treat “SDD exists but no tickets” as fully planned;
    - steers users toward ticket-based execution.

Acceptance criteria:
- `TaskScope` continues to map:
  - tiny ⇔ “small” — tickets optional;
  - normal ⇔ “medium” — tickets recommended/required;
  - large ⇔ “large” — tickets required.
- CLI behaviour:
  - `kotef run --goal` when `.sdd/` exists and `TaskScope !== 'tiny'`:
    - if no open tickets exist:
      - either:
        - run a ticket-generation step (using existing SDD architect + goal) to create `.sdd/backlog/tickets/open/*.md`, then inform user / execute; OR
        - fail with a clear message instructing the user to generate tickets (short-term safe fallback).
  - For tiny tasks:
    - it remains valid to run without tickets.
- Prompts:
  - `meta_agent.md` and/or `planner.md` explicitly mention:
    - size-based ticket expectations;
    - that non-tiny tasks in SDD projects should be executed via tickets, not ad-hoc goals.

## Steps
1. Update `src/cli.ts` `run` command:
   - Compute `taskScope` (already done) and inspect `.sdd/backlog/tickets/open`.
   - For `TaskScope !== 'tiny'` and no open tickets:
     - add a small wrapper around `runSddOrchestration` or a new ticket-only helper to create tickets based on existing `.sdd/architect.md` + new goal;
     - or, as a minimal first step, fail fast with a clear message to the user.
2. Ensure chat-mode behaviour remains sensible:
   - chat already orchestrates SDD → tickets; verify that this aligns with the new contract.
3. Update `meta_agent.md` and/or `planner.md` to:
   - explain task size categories and how they relate to tickets;
   - discourage working on medium/large tasks without an explicit ticket.
4. Add short documentation note (if needed) to `README.md` or `docs/KB.md` describing the ticket requirement semantics.

## Affected files/modules
- `src/cli.ts`
- `src/agent/task_scope.ts` (read-only; mapping reused)
- `src/agent/prompts/body/meta_agent.md`
- `src/agent/prompts/body/planner.md`
- Optional docs:
  - `README.md`
  - `docs/KB.md`

## Tests
- Manual:
  - In a project with `.sdd/` but no open tickets:
    - run `kotef run --goal "<non-trivial goal>"` and check that the CLI:
      - either generates tickets and shows them, or
      - refuses to run without tickets and explains why.
  - In a tiny-task scenario, ensure `kotef run --goal` still works without tickets.

## Risks & Edge Cases
- Risk: breaking existing automation that calls `kotef run --goal` without tickets.
  - Mitigation: start with a clear, non-silent failure path and a simple way to opt in to ticket generation.
- Risk: confusion between chat and run modes.
  - Mitigation: document that chat orchestrates SDD + tickets for each new goal by design.

## Dependencies
- Upstream:
  - 42-deep-search-and-ticket-flow-design.md
  - 45-ticket-lifecycle-open-to-closed-and-run-reporting.md
- Downstream:
  - 47-deep-search-and-ticket-flow-tests-and-validation.md

