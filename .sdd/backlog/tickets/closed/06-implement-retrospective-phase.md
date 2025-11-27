# Ticket: 06 Implement Phase 10: Retrospective & Learning

Spec version: v1.0
Context: `sd.md` Phase 10, `architect.md` Snitch/Orchestrator

## Objective & DoD
Implement a "Retrospective" phase where the agent captures learnings and updates its internal heuristics or best practices.
**DoD:**
- At the end of a run, the agent generates a "Retrospective" summary.
- If significant learnings are found, it appends them to `.sdd/best_practices.md` or a new `heuristics.md`.
- Metrics (steps taken, errors) are logged.

## Steps
1.  Add a `retrospective` node to `src/agent/graph.ts` (runs before `END`).
2.  Create `src/agent/prompts/retrospective.md`.
    -   Instruction: "Review the run. What went well? What failed? Suggest 1 improvement."
3.  Implement `retrospectiveNode` to write these learnings.

## Affected Files
-   `src/agent/graph.ts`
-   `src/agent/nodes/retrospective.ts` (new)
-   `src/agent/prompts/retrospective.md` (new)

## Risks
-   Agent might pollute `best_practices.md` with noise. Mitigation: Use a separate `learning_log.md` initially.
