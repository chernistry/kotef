# Ticket: 45 Ticket lifecycle: open → closed and run reporting

Spec version: v1.0 / kotef-ticket-lifecycle-v2

## Context
- Architect spec:
  - `.sdd/architect.md` §9.3 Ticket Lifecycle
  - `.sdd/architect.md` §9.4 Run Report ↔ Ticket Linkage
- Design note:
  - `.sdd/deep_search_and_tickets.md` — sections 5 (Ticket Flow: Current vs Target) and 6 (Planned Changes).
- Current implementation:
  - `src/agent/nodes/ticket_closer.ts`
  - `src/agent/graph.ts`
  - `src/cli.ts`
  - `src/agent/run_report.ts`
  - `test/agent/tickets_lifecycle.test.ts`

## Objective & Definition of Done
- Ensure that:
  - every successful ticket run (where the agent decides `done === true`) moves the ticket file from `backlog/tickets/open` to `backlog/tickets/closed`;
  - the final ticket location and status are visible in run reports.
- Make ticket lifecycle observable and aligned with `.sdd/architect.md`:
  - `ticketId`, `ticketPath`, and `ticketStatus` are set for ticket runs.

Acceptance criteria:
- `ticket_closer` remains the primary mechanism to move tickets open → closed.
- CLI (`src/cli.ts`) for both `run --ticket` and `chat`:
  - sets `ticketId` and initial `ticketPath` when executing a ticket;
  - after graph invocation, infers final `ticketStatus`:
    - `"closed"` if final `ticketPath` is under `backlog/tickets/closed`;
    - `"open"` if final `ticketPath` (or initial one) is still under `backlog/tickets/open`.
- `writeRunReport`:
  - receives and writes `ticketId`, `ticketPath`, `ticketStatus` when present.
- Optional safety net:
  - If `result.done === true` and final `ticketPath` still points to `backlog/tickets/open`, CLI either:
    - logs a warning, or
    - performs a last-resort move to `closed/` (configurable / conservative).

## Steps
1. Update `src/cli.ts`:
   - For single-ticket runs (`run --ticket`):
     - derive `ticketId` from the ticket filename without extension;
     - pass `ticketId`, `ticketPath` and computed `ticketStatus` into `RunSummary`.
   - For chat-mode sequential ticket execution:
     - do the same per ticket.
2. Update `src/agent/run_report.ts` usage:
   - ensure `RunSummary` ticket fields are populated when a run is ticket-based;
   - no behaviour change for goal-only runs without tickets.
3. (Optional) Add a conservative fallback:
   - If `result.done` is true and `ticketPath` still under `open/`, decide whether to:
     - leave as-is but log explicitly, OR
     - move to `closed/` from CLI (guarded by `dryRun` and clear logs).
4. Extend or add tests:
   - new tests around CLI or a small helper to verify `ticketStatus` inference and run-report content.

## Affected files/modules
- `src/cli.ts`
- `src/agent/run_report.ts`
- `src/agent/nodes/ticket_closer.ts` (read-only; ensure behaviour is compatible)
- Tests (new or extended) under `test/agent/` or `test/cli/`.

## Tests
- Unit/integration tests for:
  - mapping of ticket filename → `ticketId`;
  - `ticketStatus` detection based on final path.
- Manual:
  - Execute a synthetic ticket and verify:
    - ticket moved from open → closed;
    - run report contains ticket metadata.

## Risks & Edge Cases
- Risk: double-moving tickets if both `ticket_closer` and CLI fallback act on the same file.
  - Mitigation: CLI fallback should only run when `ticketPath` remains in `open/` after graph completion.
- Risk: breaking non-ticket runs.
  - Mitigation: only set ticket fields when a ticket was explicitly selected.

## Dependencies
- Upstream:
  - 42-deep-search-and-ticket-flow-design.md
- Downstream:
  - 46-ticket-requirement-for-medium-and-large-tasks.md
  - 47-deep-search-and-ticket-flow-tests-and-validation.md

