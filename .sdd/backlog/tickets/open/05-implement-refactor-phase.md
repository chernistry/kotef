# Ticket: 05 Implement Phase 7: Refactoring & Debt Management

Spec version: v1.0
Context: `sd.md` Phase 7, `architect.md` Coder/Planner

## Objective & DoD
Implement a dedicated "Refactoring & Debt" phase where the agent cleans up code and creates tech debt tickets for remaining issues.
**DoD:**
- Agent explicitly considers refactoring *after* verification (or before, if critical).
- Agent creates "Tech Debt" tickets in `.sdd/backlog/tickets/open/` for known issues it couldn't fix.
- `janitorNode` or a specific Planner state handles this.

## Steps
1.  Define a `refactor` or `cleanup` state in `src/agent/graph.ts`.
2.  Update `src/agent/prompts/planner.md` to transition to this state after verification.
3.  Implement logic to create new tickets (using `write_file`) for tech debt.
    -   Format: `NN-tech-debt-slug.md`.

## Affected Files
-   `src/agent/graph.ts`
-   `src/agent/prompts/planner.md`
-   `src/agent/nodes/planner.ts`

## Risks
-   Agent might get stuck in a refactoring loop. Mitigation: Strict budget for this phase (e.g., 1 turn).
