# Ticket: 58 Ticket Closer Not Moving Tickets to Closed Folder

Spec version: v1.0

## User Problem
When tickets are completed (`done: true`), they remain in `open/` folder. The `closed/` folder is never created, and tickets are never moved. This makes it impossible to track which tickets are actually done.

## Observed Behavior
From logs:
```
"Planner decision","next":"done","reason":"Success..."
"Run completed.","done":false
"Ticket not done, skipping commit"
```

Even when planner says "done", the ticket stays in `open/` and `done: false` in final state.

## Root Cause Analysis

**Hypothesis 1: ticket_closer node never called**
- Planner sets `next: "done"` but graph might not route to `ticket_closer`
- Check `src/agent/graph.ts` - does `done` edge lead to `ticket_closer`?

**Hypothesis 2: ticket_closer called but fails silently**
- `src/agent/nodes/ticket_closer.ts` has try-catch that swallows errors
- Returns empty object `{}` on failure instead of propagating error
- State doesn't get updated with `done: true`

**Hypothesis 3: Planner says "done" but state.done stays false**
- Planner returns decision but doesn't set `done: true` in state
- ticket_closer checks `state.done` and skips if false

**Hypothesis 4: closed/ folder not created**
- `ticket_closer.ts:23` does `await fs.mkdir(closedDir, { recursive: true })`
- But if dry-run or permissions issue, folder not created
- `fs.rename()` fails silently

## Outcome / Success Signals
- Completed tickets move from `open/` to `closed/`
- `closed/` folder exists after first ticket completion
- Logs show: "Ticket moved to closed backlog"
- State has `done: true` when ticket completed

## Objective & Definition of Done
Fix ticket_closer to actually move tickets and create closed/ folder.

- [ ] Identify why ticket_closer not called or fails
- [ ] Ensure `closed/` folder created before rename
- [ ] Ensure state.done propagates correctly
- [ ] Add logging to track ticket_closer execution
- [ ] Test: Complete a ticket → verify it moves to closed/

## Steps

### Investigation
1. Check `src/agent/graph.ts` - trace "done" edge routing
2. Add debug logs to `ticket_closer.ts` entry point
3. Check if `state.done` is set when planner returns `next: "done"`
4. Verify `fs.rename()` actually executes (not blocked by dry-run)

### Fix (likely needed)
1. In `src/agent/nodes/planner.ts` - when decision.next === 'done', set `done: true` in return
2. In `src/agent/graph.ts` - ensure "done" routes through ticket_closer before END
3. In `src/agent/nodes/ticket_closer.ts` - improve error logging, don't swallow errors
4. Ensure ticket_closer runs even in dry-run (or document that it doesn't)

## Affected files/modules
- `src/agent/graph.ts` (routing)
- `src/agent/nodes/planner.ts` (done state)
- `src/agent/nodes/ticket_closer.ts` (execution)
- `src/cli.ts` (final state check)

## Tests
```bash
# Test: Complete a simple ticket
cd /tmp/test-kotef
mkdir -p .sdd/backlog/tickets/open
echo "# Test ticket" > .sdd/backlog/tickets/open/01-test.md

node bin/kotef run --root /tmp/test-kotef --ticket 01 --goal "Create hello.txt"

# Verify
ls .sdd/backlog/tickets/closed/01-test.md  # Should exist
ls .sdd/backlog/tickets/open/01-test.md    # Should NOT exist
```

## Risks & Edge Cases
- **Dry-run mode**: ticket_closer might be skipped in dry-run
  - Solution: Document or make ticket_closer work in dry-run
- **Concurrent runs**: Two runs on same ticket could race
  - Solution: Use atomic file operations or locks
- **Missing ticketPath**: If state.sdd.ticketPath is undefined, ticket_closer does nothing
  - Solution: Validate ticketPath exists before attempting move

## Dependencies
- Ticket 57 (dry-run default) - may be related

## Priority
**HIGH** - Breaks ticket workflow, makes progress tracking impossible
