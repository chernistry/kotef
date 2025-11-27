# Ticket: 04 Implement Phase 4: Work Planning & Budgets

Spec version: v1.0
Context: `sd.md` Phase 4, `architect.md` Planner

## Objective & DoD
Implement the "Work Planning" phase where the agent creates a granular work plan with explicit budgets for each step/phase.
**DoD:**
- Planner produces a `work_plan` (list of steps) and `budget_allocation` (tokens/commands per step).
- `AgentState` tracks the current plan and remaining budget.
- Execution profile (`strict`, `fast`, etc.) is explicitly selected and stored.

## Steps
1.  Update `src/agent/state.ts` to include `work_plan` and `budget_allocation`.
2.  Update `src/agent/prompts/planner.md` to require budget estimation.
    -   Instruction: "Break down the work into steps. Assign a budget (e.g., max 3 tool calls) to each step."
3.  Update `src/agent/nodes/planner.ts` to enforce these budgets (or at least track them).

## Affected Files
-   `src/agent/state.ts`
-   `src/agent/prompts/planner.md`
-   `src/agent/nodes/planner.ts`

## Risks
-   Budgets might be too tight. Mitigation: Allow dynamic re-budgeting if the agent gets stuck (with a penalty/log).
