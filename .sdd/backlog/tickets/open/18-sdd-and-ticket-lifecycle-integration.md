# Ticket: 18 SDD Brain & Ticket Lifecycle Integration

Spec version: v1.2  
Context: `.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md`, SDD runtime in `src/agent/graphs/sdd_orchestrator.ts`, ticketing logic in `src/agent/nodes/{planner.ts,coder.ts,ticket_closer.ts}`, CLI in `src/cli.ts`.  
Dependencies: 04 (interactive SDD orchestrator, closed), 07 (SDD bootstrap, closed), 12 (SDD summaries & context optimization, closed), 13 (Goal‑First DoD), 14 (stop rules).

## Objective & DoD

Ensure that:

- SDD (“brain”) and runtime agent (“body”) are **consistently integrated**,
- tickets created or updated during runs are **never silently dropped**, and
- the agent can autonomously:
  - bootstrap `.sdd/` when missing,
  - respect an existing `.sdd/` when present,
  - maintain a clean lifecycle for tickets: `open → in progress → closed`.

### Definition of Done

- [ ] SDD bootstrap behaviour:
  - [ ] When `.sdd` is missing:
    - [ ] The orchestrator creates `project.md`, `agent.md`, `best_practices.md`, `architect.md`, and initial tickets under `.sdd/backlog/tickets/open` for the goal.
  - [ ] When `.sdd` exists:
    - [ ] Orchestrator **must not overwrite** existing SDD unless explicitly requested.
    - [ ] It should summarise SDD for the agent and re‑use the existing backlog.
- [ ] Ticket lifecycle:
  - [ ] Tickets are persisted in `.sdd/backlog/tickets/open/*.md` while work is in progress.
  - [ ] Once a ticket’s goal is achieved (per planner/verifier decision), its file is moved to `.sdd/backlog/tickets/closed/`.
  - [ ] The agent never deletes tickets; it only moves them or spawns follow‑up tickets.
- [ ] The agent can:
  - [ ] Create new tickets from Planner or Snitch when:
    - global issues are discovered outside the current goal,
    - research reveals tech debt, or
    - it needs to hand off work to a future run.
  - [ ] Include explicit references in new tickets to:
    - relevant SDD sections (`architect.md`, `best_practices.md`),
    - files and commands involved.

## Implementation Sketch

### 1. Clarify SDD “Brain vs Body” in Architect

Update `.sdd/architect.md` with a short section:

- Brain:
  - `brain/templates/*` (immutable SDDRush templates).
  - `.sdd/*` in each target repo (project‑specific SDD).
- Body:
  - `src/agent/*` (graph, nodes, tools).
- The orchestrator’s responsibility:
  - Use brain templates to seed new SDD when missing.
  - Treat existing `.sdd/` as **authoritative** and only append to it (e.g., adding tickets, issues, research updates), not regenerate whole files.

### 2. Orchestrator Behaviour

In `src/agent/graphs/sdd_orchestrator.ts`:

- On run start:
  - Check for `.sdd/` presence.
  - If missing:
    - Generate project spec from goal using brain templates.
    - Run research → best_practices → architect → tickets pipeline.
  - If present:
    - Load existing `.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md`.
    - Summarize them for the agent (short summary stored in state; details available via `read_file` tools).
    - Skip re‑creating tickets; rely on existing backlog + any new tickets created by Planner.

Add guardrails:

- Optionally, support a `--reseed-sdd` flag to allow full regeneration when the user wants a reset, but default behaviour must be non‑destructive.

### 3. Ticket Path Plumbing

Ensure `AgentState` includes:

```ts
ticketPath?: string;   // absolute or project-relative
ticketId?: string;     // simple slug or name
```

Planner should:

- When starting from an existing `.sdd/backlog/tickets/open/*.md`, set `ticketPath` and `ticketId`.
- When no ticket exists (goal → new run):
  - Create a minimal ticket file for this goal in `.sdd/backlog/tickets/open` (e.g., `NN-goal-slug.md`).
  - Populate `ticketPath` and `ticketId` in state.

Coder and Verifier should:

- Treat `ticketPath` as the “current spec” for the work they are doing (for context, not for rewriting).

`ticket_closer.ts` should:

- Move `ticketPath` from `open` to `closed` when Planner/Verifier decide `done=true`.
- Update state to reflect closed status.

### 4. Ticket Creation from Planner & Snitch

Planner prompt and implementation:

- Add explicit instructions:
  - If planner uncovers related but **distinct** work beyond current goal (e.g., “global test suite broken”), it should:
    - Not expand the current ticket into an unbounded scope.
    - Instead, ask the runtime to spawn a **new ticket** in `.sdd/backlog/tickets/open` that captures this as follow‑up work.

Snitch:

- When constraints or stop‑rules abort a run (`aborted_stuck` or `aborted_constraint`):
  - Write to `.sdd/issues.md` as today.
  - Optionally generate tickets for clearly identifiable follow‑up tasks (e.g., “Fix failing `npm test` in CI for project X”).

### 5. Run Report ↔ Ticket Linkage

Extend run reports to include:

- `ticketId` / `ticketPath`,
- whether that ticket ended as `closed` or still `open`,
- any follow‑up tickets created (IDs).

This makes it easy to trace which runs closed which tickets and helps future evaluation.

## Steps

1. **Architect & SDD updates**
   - [ ] Add “Brain vs Body & Ticket Lifecycle” section to `.sdd/architect.md`.
   - [ ] Ensure `.sdd/project.md` references the ticketing process in its DoD/Process sections.

2. **Orchestrator refactor**
   - [ ] Implement presence check for `.sdd/`.
   - [ ] Implement non‑destructive behaviour when `.sdd/` exists (no re‑generation).
   - [ ] Ensure bootstrap pipeline uses brain templates only when needed.

3. **Ticket path plumbing**
   - [ ] Extend `AgentState` with `ticketPath` and `ticketId`.
   - [ ] Update CLI to optionally accept a ticket path/ID as input for runs.
   - [ ] Update Planner to set these fields when starting work on a ticket or creating a new one.

4. **Ticket closing and creation**
   - [ ] Verify `ticket_closer.ts` logic moves tickets correctly and never deletes.
   - [ ] Extend Planner & Snitch to create follow‑up tickets when scope boundaries are reached.

5. **Run report linkage**
   - [ ] Update run report to record which tickets were worked on and their final status.

## Affected Files / Modules

- `.sdd/architect.md`, `.sdd/project.md`
- `src/agent/graphs/sdd_orchestrator.ts`
- `src/agent/state.ts`
- `src/agent/nodes/{planner.ts,snitch.ts,ticket_closer.ts}`
- `src/cli.ts`
- `src/agent/run_report.ts`
- Tests under `test/agent/tickets_lifecycle.test.ts` (new)

## Risks & Edge Cases

- Existing repos with partially generated SDD may need gentle migration; consider a one‑time “SDD summary” step to detect inconsistencies.
- Mis‑scoped tickets can still lead to very large “monster tickets”; future work may need ticket‑splitting logic, but that’s out of scope here.

## Non‑Goals

- This ticket does **not** redesign how tickets are written (content style); it focuses on lifecycle and integration.
- It does **not** implement multi‑ticket planning within a single run; we continue to focus on one main ticket/goal per run.


