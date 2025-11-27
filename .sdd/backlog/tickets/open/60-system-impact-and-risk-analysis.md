# Ticket: 60 System Impact & Risk Analysis

Spec version: v1.0
Context: `sd.md` Phase 2 (Analyze current system state)

## Objective
Prevent "dive-in-and-break-things" behavior by forcing the agent to build a mental model of the system, impact, and risks *before* writing any code.

## Definition of Done
- [ ] Planner generates an `impact_map` (list of likely affected files/modules) before the first `coder` call.
- [ ] Planner generates a `risk_map` (complexity, recent churn, critical paths) for the affected area.
- [ ] Planner uses these maps to choose the `execution_profile` (e.g., switch to `strict` if touching high-risk auth module).

## Implementation Steps
1.  **Impact Analysis Logic**:
    -   Implement `analyzeImpact(goal, codebase)` in `planner.ts`.
    -   Use `grep` / `search` to find dependencies.
    -   Use `git log --stat` to find "hotspots" (files changed frequently).
2.  **State Update**:
    -   Add `impactMap` and `riskMap` to `AgentState`.
3.  **Prompt Update (`planner.md`)**:
    -   Require `impact_map` and `risk_map` fields in the JSON output when `next="coder"`.
    -   Add heuristic: "If `risk_map` shows High Risk, set `profile='strict'`."

## Affected Files
-   `src/agent/nodes/planner.ts`
-   `src/agent/prompts/body/planner.md`
-   `src/agent/state.ts`

## Risks
-   **Over-analysis**: Agent might spend too much time analyzing. *Mitigation*: Time-box analysis step.
