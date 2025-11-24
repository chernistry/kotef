# Architect Delta Prompt Template

Instruction for AI: given an existing architecture specification and a change request, produce a minimal, implementation‑ready delta instead of a full rewrite.

Context:
- Project: {{PROJECT_NAME}}
- Domain: {{DOMAIN}}
- Tech stack: {{TECH_STACK}}
- Year: {{YEAR}}
- Existing spec: `.sdd/architect.md`
- Project description (incl. Definition of Done): `.sdd/project.md`
- Best practices: `.sdd/best_practices.md`
- Optional additional context: {{ADDITIONAL_CONTEXT}}

Operating Principles:
- Treat `.sdd/architect.md` as the current source of truth.
- Apply changes surgically: prefer small, localized updates over restructuring the whole document.
- Preserve existing good decisions unless the change request or new constraints clearly invalidate them.
- Keep tickets and ADRs consistent with any changes you make.

Task:
Update the architecture specification and backlog to reflect a mid‑flight change request, using a delta format that is easy to apply manually.

Inputs (provided by user):
1) Change request
   - New or updated requirements (functional + non‑functional).
   - New constraints (compliance, performance, cost, reliability, security).
   - Any changes to Definition of Done.
2) Implementation state (optional)
   - Summary of which tickets are completed/blocked.
   - Relevant issues from `.sdd/issues.md` (if any).

Output Structure (Markdown):

## 1. Summary of Requested Changes
- Short list of what is changing and why (business/technical drivers).
- Impact level: [Low/Medium/High] for architecture, tickets, and risk profile.

## 2. Spec Diffs (architect.md)
- For each affected section in `.sdd/architect.md`, provide a patch‑style update:
  - Section: <heading or path, e.g., "Components → Auth Service">
  - Change type: [Add/Update/Remove]
  - New content (only the revised subsection or bullets, not the entire file).
- Keep the overall structure of `architect.md` intact; only touch sections that are actually affected by the change request.

## 3. ADR Updates
- List new or updated ADRs needed to capture decisions caused by the change:
  - [ADR‑0XX] Title — summary of decision and alternatives.
- For each ADR, specify:
  - What changed compared to previous decisions.
  - Why the change is necessary (refer to risks, Definition of Done, or new constraints).

## 4. Ticket Changes
- For the backlog in `.sdd/backlog/tickets/open/`:
  - Tickets to deprecate/close as obsolete (with brief reasons).
  - Tickets to update:
    - Ticket ID / file path.
    - Short description of how the ticket content should change (Objective/DoD/Steps/Tests).
  - New tickets to add:
    - Follow the standard ticket format (Objective & DoD, Steps, Affected files, Tests, Risks, Dependencies).
- Ensure each ticket references the updated spec (e.g., Spec version or new ADRs where relevant).

## 5. Risk & Metric Profile Adjustments
- Note any changes to the Metric Profile & Strategic Risk Map:
  - New or updated risks (PerfGain, SecRisk, DevTime, Maintainability, Cost, DX, Scalability).
  - Adjusted weights or priorities if the change request requires it.
- Explain how these adjustments should influence implementation going forward.

## 6. Migration & Compatibility Notes
- If the change affects existing behavior or data:
  - Outline a safe migration path (phases, toggles/feature flags, rollbacks).
  - Call out compatibility concerns (APIs, data schemas, contracts) and how to mitigate them.

Requirements
1) No chain‑of‑thought. Provide final decisions with brief, verifiable reasoning.
2) Keep changes minimal and focused on the requested scope.
3) Do not silently drop existing constraints or Definition of Done; if they must change, call this out explicitly.

