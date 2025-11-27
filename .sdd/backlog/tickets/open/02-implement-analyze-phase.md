# Ticket: 02 Implement Phase 2: Analyze System State

Spec version: v1.0
Context: `sd.md` Phase 2, `architect.md` Researcher/Planner

## Objective & DoD
Implement the "Analyze System State" phase where the agent builds a structured mental model of the impacted area (`impact_map` and `risk_map`) before designing changes.
**DoD:**
- Agent produces `impact_map` (list of likely affected files/modules) and `risk_map` (complexity/churn hotspots).
- These artifacts are stored in `AgentState` and used by the Planner.

## Steps
1.  Update `src/agent/state.ts` to include `impact_map` and `risk_map`.
2.  Update `src/agent/prompts/researcher.md` (or create a dedicated analysis prompt) to perform "System Analysis".
    -   Instruction: "Identify impacted modules. Check for high-churn or complex files."
3.  Update `src/agent/nodes/planner.ts` or `researcher.ts` to execute this analysis step after "Shape Up".
4.  Verify that `impact_map` is populated correctly for a known change (e.g., "add a field to User model").

## Affected Files
-   `src/agent/state.ts`
-   `src/agent/prompts/researcher.md`
-   `src/agent/nodes/researcher.ts`

## Risks
-   Semantic search might miss dependencies. Mitigation: Encourage "wide" search for impact analysis.
