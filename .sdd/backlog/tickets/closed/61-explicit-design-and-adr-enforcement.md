# Ticket: 61 Explicit Design & ADR Enforcement

Spec version: v1.0
Context: `sd.md` Phase 3 (Design & decision-making)

## Objective
Enforce architectural discipline. The agent should not make structural changes without a plan.

## Definition of Done
- [ ] Planner requires a `solution_sketch` (text description of changes) before coding.
- [ ] If the change is "Structural" (adds modules, changes db schema, adds dependencies), the Planner **must** check if an ADR exists or create one.
- [ ] New `doc_writer` tool or mode to write ADRs to `.sdd/architect.md` or `doc/adr/`.

## Implementation Steps
1.  **Design Heuristics**:
    -   Update `planner.md`: "If `impact_map` implies structural change, you MUST write an ADR first."
2.  **ADR Tooling**:
    -   Ensure `fs` tools allow creating new markdown files in `.sdd/` or `docs/`.
    -   (Optional) Add `write_adr` tool shortcut.
3.  **Validation**:
    -   Verifier checks: If new dependencies added in `package.json`, is there an ADR/Rationale in the plan?

## Affected Files
-   `src/agent/nodes/planner.ts`
-   `src/agent/prompts/body/planner.md`

## Risks
-   **Bureaucracy**: Agent writes ADRs for typos. *Mitigation*: Prompt instruction "Only for STRUCTURAL changes".
