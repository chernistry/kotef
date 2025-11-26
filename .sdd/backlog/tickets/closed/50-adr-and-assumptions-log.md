# Ticket: 50 ADR and assumptions log for architectural decisions

Spec version: v1.0 / kotef-sd-approaches-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — sections “Key Decisions (ADR-style)”, “Research Conflicts & Resolutions”, “Technical Debt & Refactoring Backlog”.
- SD-approaches context:
  - `.sdd/context/sd_approaches.md` — sections 1.2 (Evolutionary architecture & fitness functions, ADRs), 2–3 (full-cycle phases, “Design & decision-making”), 3.4 (“Recording decisions and assumptions”).
- Runtime prompts:
  - `src/agent/prompts/brain/architect_template.md`
  - `src/agent/prompts/brain/architect_delta_template.md`
  - `src/agent/prompts/brain/ticket_template.md`
- Current implementation:
  - No dedicated ADR files under `.sdd/` yet.
  - Planner/coder/verifier make architectural trade-offs, but decisions and assumptions are only implicitly encoded in tickets, run reports, or code.

Modern practice (Nygard ADRs, evolutionary architecture) says non-trivial design choices and assumptions should be recorded as *small, stable documents* used as “memory” for future work. Kotef currently lacks a concrete ADR + assumptions mechanism.

## Objective & Definition of Done

Objective:
- Introduce a **lightweight, first-class ADR and assumptions log** in the SDD brain and wire the agent to:
  - create or update ADR entries when making structural decisions;
  - record assumptions separately from confirmed facts;
  - surface these decisions/assumptions to future runs (planner/researcher/coder/verifier).

### Definition of Done

- ADR storage:
  - [ ] A dedicated ADR folder exists:
    - `.sdd/architecture/adr/ADR-00X-<kebab>.md`
    - ADR files follow a small template:
      - Title, Status, Context, Decision, Alternatives, Consequences, Links (tickets, code, specs).
  - [ ] `architect.md` is updated to:
    - [ ] document this ADR location and template;
    - [ ] link any existing key decisions to ADR IDs.
- Assumptions log:
  - [ ] A new `.sdd/assumptions.md` file exists with:
    - [ ] a table or list of assumptions:
      - fields: `id`, `area/module`, `statement`, `status` (`tentative`/`confirmed`/`rejected`), `source` (spec, research, guess), `linked_tickets/ADRs`.
  - [ ] `architect.md` references this assumptions log and how it should be used.
- Planner integration:
  - [ ] `plannerNode` is able to:
    - [ ] attach high-level design choices to ADRs:
      - when Planner chooses among architectural options (e.g. new module vs extending existing one), it:
        - emits a structured “decision summary” in state (e.g. `state.designDecision`), and
        - triggers a helper that appends/updates an ADR file using FS tools.
    - [ ] record assumptions:
      - when Planner relies on uncertain inferences (from research or missing specs), it:
        - records them in `state.assumptions` with `tentative` status, and
        - syncs them into `.sdd/assumptions.md` at the end of the run.
- Snitch / run-report integration:
  - [ ] When a run finishes `done` or `partial`:
    - [ ] any `tentative` assumptions that were clearly validated are marked `confirmed`;
    - [ ] any that were explicitly disproved are marked `rejected`;
    - [ ] remaining `tentative` assumptions are left as open items in `.sdd/assumptions.md`, linked from `issues.md` / ticket updates.
  - [ ] Run reports include:
    - [ ] a short list of ADRs touched or created in this run;
    - [ ] a summary of assumptions created/confirmed/rejected.

## Implementation Sketch

### 1. Define ADR and assumptions templates

- Add a small ADR template (Markdown) under `.sdd/architecture/adr/ADR-000-template.md` or document it in `.sdd/architect.md`:

```md
# ADR-00X: Short Title

Status: Proposed | Accepted | Deprecated | Superseded by ADR-00Y  
Date: YYYY-MM-DD  
Related Tickets: [NN-title], [MM-other]  
Related Code: `src/...`

## Context
<Problem / background>

## Decision
<Chosen option>

## Alternatives
- Option A: pros/cons  
- Option B: pros/cons

## Consequences
- Positive:
- Negative / Risks:
- Follow-ups / Tech Debt:
```

- Define `assumptions.md` template (append-only list or table).

### 2. Extend AgentState and utilities

- In `src/agent/state.ts`:
  - Add optional fields:
    - `designDecisions?: { id?: string; title: string; context: string; decision: string; alternatives?: string[]; consequences?: string[] }[]`
    - `assumptions?: { id?: string; area?: string; statement: string; status: 'tentative' | 'confirmed' | 'rejected'; source: 'spec' | 'research' | 'guess'; notes?: string }[]`
- Add a small utility module `src/agent/utils/adr.ts`:
  - `appendAdr(adrRoot, decisionSummary)`: creates or updates an ADR file based on a decision summary.
  - `syncAssumptions(assumptionsFile, assumptionsState)`: merges state assumptions into `.sdd/assumptions.md`.

### 3. Planner and Snitch changes

- Planner (`src/agent/nodes/planner.ts`):
  - When Planner enumerates options and selects a design (per sd_approaches “design_decide” phase), it:
    - populates `state.designDecisions` with one or more decision summaries.
  - When Planner uses uncertain research inferences or spec gaps, it:
    - populates `state.assumptions` entries with `status='tentative'`.
- Snitch (`src/agent/nodes/snitch.ts`) or an end-of-run hook:
  - After graph completion, but before writing run report:
    - call `appendAdr` for any `designDecisions` that are not yet materialized as ADR files;
    - call `syncAssumptions` to update `.sdd/assumptions.md`.
  - When errors or blocked states arise due to assumptions, reference those assumption IDs in the snitch entry.

### 4. Prompt and SDD alignment

- Update:
  - `architect_template.md`, `architect_delta_template.md`, `ticket_template.md`, and any relevant SDD prompts to:
    - mention ADRs as required output for structural decisions;
    - direct the agent to record assumptions in `.sdd/assumptions.md`.
- Optionally add a small section to `.sdd/project.md` describing how ADRs and assumptions are used for this project.

## Steps

1. **Design ADR & assumptions format**
   - [ ] Finalize ADR filename pattern and template; document in `.sdd/architect.md`.
   - [ ] Add an initial `.sdd/assumptions.md` with a header and example entries.
2. **State & utilities**
   - [ ] Extend `AgentState` with `designDecisions` and `assumptions`.
   - [ ] Implement `src/agent/utils/adr.ts` with safe file IO (append/merge).
3. **Planner & Snitch integration**
   - [ ] Update `plannerNode` to populate `designDecisions` and `assumptions` when appropriate.
   - [ ] Update `snitchNode` (or a small post-run helper) to write ADR and assumptions updates to disk.
4. **Prompt & SDD updates**
   - [ ] Update SDD prompts and `.sdd/architect.md` to reference ADR/assumptions as part of the normal flow.
5. **Tests**
   - [ ] Add tests to ensure ADR and assumptions files are created/updated deterministically for synthetic planning decisions.

## Affected files / modules
- `.sdd/architect.md`
- `.sdd/assumptions.md` (new)
- `.sdd/architecture/adr/*.md` (new)
- `src/agent/state.ts`
- `src/agent/utils/adr.ts` (new)
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/snitch.ts`
- `src/agent/prompts/brain/architect_template.md`
- `src/agent/prompts/brain/architect_delta_template.md`
- `src/agent/prompts/brain/ticket_template.md`

## Tests
- Unit tests:
  - for `appendAdr` and `syncAssumptions` with temporary directories.
- Integration tests:
  - a small scenario where Planner makes a design choice → ADR file appears;
  - a scenario where a speculative research-based assumption is recorded and later confirmed or left open.

## Risks & Edge Cases
- ADR explosion: too many tiny ADRs can become noise.
  - Mitigation: only create ADRs for non-trivial structural decisions; encode thresholds in prompts.
- Merge conflicts on ADR/assumptions files in multi-user workflows.
  - Mitigation: keep ADR entries small, append-only; treat conflicts like normal markdown merges.

## Dependencies
- Upstream:
  - 20-repo-understanding-and-context-loading.md (ensures basic repo/Sdd awareness).
- Downstream:
  - Future tickets on risk registers, metrics, and phase tracking will rely on the ADR/assumptions structure.

