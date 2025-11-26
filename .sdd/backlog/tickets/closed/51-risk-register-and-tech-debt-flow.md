# Ticket: 51 Risk register and tech-debt flow integrated with Snitch

Spec version: v1.0 / kotef-sd-approaches-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — sections “Metric Profile & Strategic Risk Map”, “Technical Debt & Refactoring Backlog”.
- SD-approaches context:
  - `.sdd/context/sd_approaches.md` — sections 1.2 (Evolutionary architecture & fitness functions), 2 (Phase 2/7: risk_map, tech_debt), 3.3 (Quality and risk thinking), 3.7 (Ability to stop and say “partial/blocked”).
- Current implementation:
  - `.sdd/issues.md` written by `snitchNode` contains textual reasons for aborted/blocked runs.
  - Tickets sometimes encode debt, but there is no central **risk register** or structured tech-debt flow.
  - Progress controller and budgets detect “stuck” conditions, but the mapping to explicit risks is ad-hoc.

Modern practice (evolutionary architecture, SRE, risk/fitness functions) suggests tracking risks and debt in a structured way to guide future work. Kotef needs an explicit risk register and tech-debt flow that connect Planner, Verifier, Snitch, and tickets.

## Objective & Definition of Done

Objective:
- Introduce a **structured risk register** and a consistent **tech-debt flow**:
  - risks discovered during runs are recorded in a central `.sdd/risk_register.md`;
  - Planner and Verifier use this register to inform decisions;
  - Snitch and tickets consistently move issues into tech-debt/backlog when appropriate.

### Definition of Done

- Risk register:
  - [ ] A new file `.sdd/risk_register.md` exists with a simple, append-only schema:
    - fields per entry: `id`, `area/module`, `type` (e.g. reliability, performance, security, observability, product), `severity` (High/Medium/Low), `description`, `evidence` (tests, metrics, logs), `status` (`open`/`mitigated`/`accepted`), `links` (tickets, ADRs, runs).
  - [ ] `.sdd/architect.md` references this risk register and explains how it relates to the “Strategic Risk Map”.
- Snitch integration:
  - [ ] `snitchNode` is extended to:
    - [ ] derive a structured risk entry from failure context (e.g. failing commands, recurring errors, budget exhaustion, stuck loops);
    - [ ] append that entry to `.sdd/risk_register.md` when `terminalStatus` indicates an aborted/blocked run;
    - [ ] continue to update `.sdd/issues.md` for narrative context.
- Tech-debt tickets:
  - [ ] When a risk is identified but not fixable within the current run:
    - [ ] Snitch (or a small helper) can optionally create a **tech-debt ticket** under `.sdd/backlog/tickets/open/`:
      - with title “Tech debt: <area> <short description>”,
      - referencing the risk register entry and ADRs.
  - [ ] Ticket template is updated to include:
    - [ ] a dedicated “Risk & Impact” section,
    - [ ] a link back to the risk register entry when relevant.
- Planner & Verifier:
  - [ ] Planner:
    - [ ] can read `.sdd/risk_register.md` and surface risks relevant to the current area in its prompt (e.g. “this module has High reliability risk; prefer strict profile and more tests”).
  - [ ] Verifier:
    - [ ] when tests/probes expose a recurring failure pattern that matches an existing risk entry, updates that entry’s evidence and status (e.g. “still occurring in run X”).

## Implementation Sketch

### 1. Define risk register format

- Create `.sdd/risk_register.md` with:

```md
# Risk Register

| id | area | type | severity | status | description | evidence | links |
|----|------|------|----------|--------|-------------|----------|-------|
| R-001 | auth module | security | High | open | ... | failing test XYZ, run 2025-11-26T... | [Ticket 52], [ADR-007] |
```

- Alternatively, allow a bullet-list format but keep a clear, parseable structure.

### 2. Extend AgentState and utilities

- In `src/agent/state.ts`:
  - Add optional field `riskEntries?: { id?: string; area?: string; type?: string; severity?: 'high' | 'medium' | 'low'; status?: 'open' | 'mitigated' | 'accepted'; description: string; evidence?: string; links?: string[] }[]`.
- Add a helper in `src/agent/utils/diagnostics.ts` or a new `risk.ts`:
  - `deriveRiskEntry(state: AgentState): RiskEntry[]` to compute risk candidates from:
    - terminalStatus,
    - failureHistory,
    - functionalChecks,
    - repeated failing commands.
  - `appendRiskEntries(riskFile, entries)` to update `.sdd/risk_register.md`.

### 3. Snitch & ticket generation

- `snitchNode`:
  - After writing `.sdd/issues.md`, call `deriveRiskEntry` and `appendRiskEntries`.
  - Optionally, when severity is `high`, spawn a small helper to create a new tech-debt ticket with:
    - title `Tech debt: <area> <short desc>`,
    - body referencing the risk id and evidence.

### 4. Planner and Verifier consumption

- Planner:
  - Before planning, read `.sdd/risk_register.md` and filter entries relevant to the impacted area (based on project summary and impact map).
  - Include a summarized view (e.g. top 3 open risks in this area) in the planner prompt context.
  - Use this to:
    - prefer stricter profiles for areas with High risk;
    - prioritize tasks that mitigate open High risks when multiple options exist.
- Verifier:
  - When a verification failure matches an existing risk (e.g. by file path, test name, or risk `id` in logs), update the risk entry with this new evidence.

## Steps

1. **Risk register scaffold**
   - [ ] Create `.sdd/risk_register.md` with initial structure and a few manual entries (if any known).
   - [ ] Update `.sdd/architect.md` to reference it.
2. **State & utility**
   - [ ] Extend `AgentState` with `riskEntries`.
   - [ ] Implement helper(s) to derive and append risk entries.
3. **Snitch & tickets**
   - [ ] Update `snitchNode` to write structured risk entries and optional tech-debt tickets.
4. **Planner & Verifier**
   - [ ] Read from risk register and reflect relevant risks in prompts and decisions.
5. **Tests**
   - [ ] Add tests verifying that blocked runs produce risk entries and optional tech-debt tickets.

## Affected files / modules
- `.sdd/risk_register.md` (new)
- `.sdd/architect.md`
- `.sdd/backlog/tickets/open/*` (auto-generated tech-debt tickets)
- `src/agent/state.ts`
- `src/agent/utils/diagnostics.ts` or `src/agent/utils/risk.ts` (new)
- `src/agent/nodes/snitch.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/verifier.ts`

## Tests
- Unit:
  - deriving risk entries from synthetic AgentState with known failures.
  - appending to `risk_register.md` without corrupting existing entries.
- Integration:
  - scenario where a failing run produces both `.sdd/issues.md` and a new risk entry/tech-debt ticket.

## Risks & Edge Cases
- Too many low-priority risks cluttering the register.
  - Mitigation: use severity and type; prompts should teach the agent to focus on High/Medium first.
- Over-eager ticket creation:
  - Mitigation: only auto-create debt tickets for High severity, otherwise just update the register.

## Dependencies
- Upstream:
  - 50-adr-and-assumptions-log.md (for ADR linkage).
- Downstream:
  - Future tickets on metrics and fitness functions can use the risk register as input.

