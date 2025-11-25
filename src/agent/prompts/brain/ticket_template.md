# Ticket Template (SDD)

Use this as a canonical structure when creating tickets in `.sdd/backlog/tickets/open/`.

```markdown
# Ticket: <nn> <short-title>

Spec version: vX.Y / <commit or ADR reference>

## Context
- Links to relevant sections in `.sdd/architect.md` (components, ADRs, API contracts, quality standards).
- Optional links to `.sdd/project.md` (goals, Definition of Done).

## Objective & Definition of Done
- One paragraph summary of intent.
- Bullet list of concrete outcomes that must be true when this ticket is “Done”.

## Steps
1. ...
2. ...
3. ...

## Affected files/modules
- `path/to/file1.ext`
- `path/to/file2.ext`

## Tests
- Test cases to add/update.
- Commands to run (e.g. `npm test`, `pytest`, `go test ./...`, etc.).

## Risks & Edge Cases
- Known risks, edge cases, and failure modes to handle.

## Dependencies
- Upstream tickets: ...
- Downstream tickets: ...
```

