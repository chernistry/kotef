# Ticket: 22 Code Hygiene & Comment Cleanup

Spec version: v1.0  
Context: `.sdd/architect.md` (Code Standards & Conventions), `.sdd/best_practices.md` (Code Quality Standards), runtime implementation under `src/agent/*` (especially `src/agent/nodes/verifier.ts` and other nodes where previous LLMs left long reasoning comments).  
Dependencies: None (can be done in parallel with other work).

## Objective & DoD

Remove **low‑value, long “thinking process” comments** left by previous LLMs and ensure code comments:

- are concise,
- explain non‑obvious intent, and
- align with the project’s code‑quality standards.

### Definition of Done

- [ ] All `src/agent/*` files are scanned for:
  - multi‑paragraph comments that describe historical thought processes or internal debates,
  - commented‑out experimental code,
  - TODOs that are obsolete because tickets now exist.
- [ ] Such comments are either:
  - deleted, or
  - replaced with short, focused comments that explain **why** the current logic is the way it is (particularly around state handling and stop rules).
- [ ] No changes are made to runtime behaviour; this is a pure code hygiene pass.

## Implementation Sketch

1. **Identify noisy comments**
   - Look for:
     - comments starting with “Note: earlier LLM…” or similar,
     - huge block comments explaining prior experiments,
     - comments that restate code trivially (e.g. `// increment counter` above `counter++`).

2. **Rewrite or remove**
   - For each noisy comment:
     - If it is not providing unique insight, delete it.
     - If it hints at important design decisions or gotchas, rewrite as a concise one‑line or short block comment that:
       - ties back to `.sdd/architect.md` where helpful (“stop rules per ticket 14”),
       - explains invariants or expectations (e.g., why we clamp certain transitions).

3. **Align with standards**
   - Ensure comments follow:
     - a consistent style (full sentences where appropriate),
     - no personal tone or references to specific runs,
     - no obsolete TODOs without corresponding tickets (if a TODO is important, create a ticket and reference it).

## Steps

1. **Manual scan**
   - [ ] Review `src/agent/nodes/{verifier.ts,planner.ts,coder.ts,researcher.ts,snitch.ts}`.
   - [ ] Review `src/agent/graph.ts`, `src/agent/state.ts`, and `src/agent/run_report.ts`.

2. **Cleanup**
   - [ ] Remove or rewrite low‑value comments.
   - [ ] Ensure all remaining comments are helpful and up‑to‑date with the latest architecture.

3. **Quick regression check**
   - [ ] Run existing tests to ensure no behaviour changes occurred.

## Affected Files / Modules

- `src/agent/*`

## Risks & Edge Cases

- Risk of accidentally deleting comments that captured important edge cases; mitigate by:
  - cross‑checking `.sdd/architect.md` and tickets for intended behaviour,
  - preserving comments that describe non‑obvious state invariants or stop conditions.

## Non‑Goals

- This ticket does **not** modify logic, change prompts, or add new features.
- It does **not** enforce a particular formatting tool; stick to existing formatter settings.

