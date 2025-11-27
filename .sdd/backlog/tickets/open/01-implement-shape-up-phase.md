# Ticket: 01 Implement Phase 1: Understand Goal (Shape Up)

Spec version: v1.0
Context: `sd.md` Phase 1, `architect.md` Planner Node

## Objective & DoD
Implement the "Shape Up" phase where the agent clarifies the goal, defines the "bet" (appetite, constraints), and sets the Definition of Done (DoD) before starting work.
**DoD:**
- Planner node explicitly outputs a `clarified_goal` object.
- `clarified_goal` includes `functional_outcomes`, `non_functional_risks`, `DoD_checks`, and `constraints`.
- The agent stops and asks for clarification if the goal is too vague (simulated or actual user interaction).

## Steps
1.  Update `src/agent/state.ts` to include `clarified_goal` in `AgentState`.
2.  Update `src/agent/prompts/planner.md` to include a "Shape Up" step in its reasoning process.
    -   Instruction: "Before planning, analyze the user goal. Define what is in scope and what is OUT of scope."
    -   Output: JSON field `clarified_goal`.
3.  Update `src/agent/nodes/planner.ts` to parse and store `clarified_goal`.
4.  Add a test case where the agent receives a vague goal and produces a shaped goal with constraints.

## Affected Files
-   `src/agent/state.ts`
-   `src/agent/prompts/planner.md`
-   `src/agent/nodes/planner.ts`

## Risks
-   Planner might hallucinate constraints. Mitigation: Explicitly ask it to derive constraints from `project.md` and `best_practices.md`.
