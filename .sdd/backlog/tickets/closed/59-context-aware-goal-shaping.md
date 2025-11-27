# Ticket: 59 Context-Aware Goal Shaping & Scoping

Spec version: v1.0
Context: `sd.md` Phase 1 (Understand goal and context)

## Objective
Enable Kotef to act like a Senior Engineer who can understand vague requests (e.g., "fix the build", "cleanup utils") by inferring context from the environment, and explicitly "shaping" the work (appetite, non-goals) before starting.

## Definition of Done
- [ ] Planner can infer intent from "vague" goals (< 10 words) by analyzing:
    - Current working directory structure.
    - `git status` / recent changes.
    - Open files (if provided in context).
- [ ] Planner explicitly defines "Appetite" (Small/Medium/Large) and "Non-Goals" in its initial thought process.
- [ ] If the goal is too broad, the Planner proposes a "Shaped Bet" (reduced scope) instead of failing or looping.

## Implementation Steps
1.  **Context Scanner**:
    -   Modify `planner.ts` (or `bootstrap.ts`) to perform a "Context Scan" if the user goal is short/vague.
    -   Scan: `ls -R` (depth 2), read `README.md` (summary), check `git diff --stat`.
2.  **Prompt Update (`planner.md`)**:
    -   Add section "Context Inference": "If goal is vague, use {{CONTEXT_SCAN}} to infer intent."
    -   Add section "Shape Up": "Define `appetite` (Small/Batch/Big) and `non_goals`."
3.  **State Update**:
    -   Add `contextScan` and `shapedGoal` to `AgentState`.

## Affected Files
-   `src/agent/nodes/planner.ts`
-   `src/agent/prompts/body/planner.md`
-   `src/agent/state.ts`

## Risks
-   **Hallucination**: Agent might infer wrong intent. *Mitigation*: Explicitly ask user to confirm if confidence is low (using `ask_human` if available, or just stating assumptions clearly).
