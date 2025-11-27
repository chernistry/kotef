# Ticket: 62 Retrospective & Learning Loop

Spec version: v1.0
Context: `sd.md` Phase 10 (Retrospective and agent learning)

## Objective
Enable the agent to learn from its own mistakes within a session and improve over time.

## Definition of Done
- [ ] At the end of a run (before exit), the agent performs a "Retrospective".
- [ ] It analyzes the run history for:
    -   Loops (repeated errors).
    -   Wasted steps (research that wasn't used).
    -   Successful patterns.
- [ ] It appends a "Learning" entry to `.sdd/best_practices.md` or a new `.sdd/learnings.md` if significant insights are found.

## Implementation Steps
1.  **Retrospective Node**:
    -   Create `src/agent/nodes/retrospective.ts`.
    -   Add to `graph.ts` before `END`.
2.  **Prompt (`retrospective.md`)**:
    -   "Analyze the `progressHistory` and `messages`. Identify 1 thing that went well and 1 thing to improve."
3.  **Persistence**:
    -   Write learnings to `.sdd/best_practices.md` under "## Automated Learnings".

## Affected Files
-   `src/agent/graph.ts`
-   `src/agent/nodes/retrospective.ts` (NEW)
-   `src/agent/prompts/body/retrospective.md` (NEW)

## Risks
-   **Noise**: `best_practices.md` becomes cluttered. *Mitigation*: Only record "High Confidence" learnings, or use a separate log file.
