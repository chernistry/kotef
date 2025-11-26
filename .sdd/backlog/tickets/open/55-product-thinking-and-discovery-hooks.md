# Ticket: 55 Product thinking and discovery hooks in SDD

Spec version: v1.0 / kotef-sd-approaches-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — Goals & Non-Goals, Definition of Done.
- SD-approaches context:
  - `.sdd/context/sd_approaches.md` — sections 1.1 (flow, DevEx, SPACE), 3.9 (Product thinking and discovery hooks), 2 (Phases 1, 8, 9).
- Existing implementation:
  - `.sdd/project.md` describes the project and DoD but does not explicitly capture:
    - user problems,
    - hypotheses,
    - success signals or simple product metrics.
  - Tickets focus on technical objectives and tests, not “what success looks like” in product terms.

Modern continuous discovery and Shape Up-style practices tie engineering work to user-facing value and learning. Kotef should carry a minimal “product thinking” thread through tickets and SDD.

## Objective & Definition of Done

Objective:
- Extend the SDD brain and prompts so that:
  - each significant goal/ticket explicitly states:
    - user problem(s),
    - expected outcome(s)/success signals,
    - simple observation hooks for post-change learning;
  - verifier and snitch can reference these when summarizing work and risks.

### Definition of Done

- SDD structure:
  - [ ] `.sdd/project.md` gains a section per major capability or feature that includes:
    - `User Problem`,
    - `Proposed Solution`,
    - `Success Signals` (qualitative or simple quantitative),
    - `Risks & Unknowns`.
  - [ ] Ticket template:
    - [ ] `src/agent/prompts/brain/ticket_template.md` is updated to include:
      - fields:
        - `User Problem:`,
        - `Outcome / Success Signals:`,
        - `Post-Release Observations:` (what to watch in logs/metrics).
- Planner and meta-agent:
  - [ ] `meta_agent` / planner prompts are updated so that:
    - for new goals, the agent:
      - derives a short “user problem” and “success signals” summary;
      - embeds them into the created ticket(s).
- Verifier & Snitch:
  - [ ] Verifier prompts include an optional reference to success signals:
    - enabling it to mention in `notes` whether the change appears aligned with success criteria (based on tests, logs, or stubs).
  - [ ] Snitch, in partial/blocked cases:
    - explicitly mentions which user problem remains unsolved or which success signal cannot yet be validated.

## Implementation Sketch

### 1. Update SDD docs and templates

- Modify `.sdd/project.md` with a “Product Goals” section describing:
  - key user problems Kotef solves (e.g., “fast, spec-driven code changes”, “safe deep research”);
  - success signals (e.g., reduced manual edits, fewer regressions, improved correctness).
- Update `ticket_template.md` to:

```md
## User Problem
- ...

## Outcome / Success Signals
- ...

## Post-Release Observations
- ...
```

### 2. Planner / meta-agent prompt changes

- In `src/agent/prompts/body/meta_agent.md` and/or `planner.md`:
  - instruct the agent to:
    - always infer a user problem and outcome for new goals;
    - populate corresponding sections in SDD tickets.

### 3. Verifier & Snitch usage

- Verifier:
  - read success signals (if present) and:
    - note in `notes` whether tests or probes give any indication about them (even if only partial).
- Snitch:
  - when blocked/partial:
    - include a short statement of “product gap” (which user problem is still unsolved).

## Steps

1. **SDD docs**
   - [ ] Update `.sdd/project.md` with product sections.
   - [ ] Update `ticket_template.md` as outlined.
2. **Prompts**
   - [ ] Extend meta-agent and planner prompts to create and preserve these fields.
3. **Verifier & Snitch**
   - [ ] Wire success signals into verifier/snitch notes for better human handoff.

## Affected files / modules
- `.sdd/project.md`
- `src/agent/prompts/brain/ticket_template.md`
- `src/agent/prompts/body/meta_agent.md`
- `src/agent/prompts/body/planner.md`
- `src/agent/prompts/body/verifier.md`
- `src/agent/nodes/verifier.ts`
- `src/agent/nodes/snitch.ts`

## Tests
- Prompt contract tests:
  - ensure new ticket fields are present and preserved.
- Manual:
  - run `kotef chat` on a new goal and verify tickets contain user problem and success signals.

## Risks & Edge Cases
- Overly verbose tickets:
  - Mitigation: prompts should encourage concise bullet points.

## Dependencies
- Related:
  - 21-eval-harness-and-regression-suite.md

