# Ticket: 03 Implement Phase 3: Design & Decision (ADRs)

Spec version: v1.0
Context: `sd.md` Phase 3, `architect.md` Planner

## Objective & DoD
Implement the "Design" phase where the agent makes explicit architectural decisions and records them as ADRs (Architecture Decision Records) for non-trivial changes.
**DoD:**
- Planner can decide to write an ADR if a decision is significant.
- ADRs are written to `.sdd/adrs/YYYY-MM-DD-title.md` (or similar).
- `AgentState` tracks created ADRs.

## Steps
1.  Update `src/agent/prompts/planner.md` to include "Design & Decision" logic.
    -   Instruction: "If the change involves new dependencies, schema changes, or structural refactoring, write an ADR."
2.  Add a tool `write_adr` (or usage of `write_file`) to the Planner's toolkit.
3.  Update `src/agent/nodes/planner.ts` to handle ADR generation.
4.  Ensure ADRs follow the template defined in `architect.md`.

## Affected Files
-   `src/agent/prompts/planner.md`
-   `src/agent/nodes/planner.ts`
-   `src/tools/fs.ts` (ensure path allowlist covers `.sdd/adrs/`)

## Risks
-   Agent might write ADRs for trivial changes. Mitigation: Tune prompt to only trigger for "Significant" changes.
