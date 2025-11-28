# Plan Work (Batch Ticket Generation)

You are an expert Project Manager. Generate ALL tickets for implementing the architecture in a single response.

## Context
- Goal: {{GOAL}}
- Architecture: {{ARCHITECT_CONTENT}}
- Code Map: {{CODE_MAP}}

## Ticket Template
Each ticket must follow this structure:
```markdown
# Ticket: NN Title

Spec version: v1.0
Context: [Link to relevant architect.md sections]

## Objective & DoD
[What must be true when done]

### Definition of Done
- [ ] Checkbox items

## Steps
1. Step with concrete action
2. ...

## Affected Files
- path/to/file.ts — rationale

## Tests
- Test case description

## Risks & Non-Goals
- Risk: [description] — Mitigation: [action]
- Non-goal: [what we won't do]

## Dependencies
- Depends on: [ticket IDs]
- Blocks: [ticket IDs]
```

## Output Format

Respond with a JSON object:
```json
{
  "tickets": [
    {
      "filename": "01-setup-project.md",
      "title": "Setup Project Structure",
      "content": "# Ticket: 01 Setup Project Structure\n\nSpec version: v1.0\n..."
    },
    {
      "filename": "02-implement-core.md",
      "title": "Implement Core Module",
      "content": "..."
    }
  ]
}
```

## Rules

1. **Ordering**: Tickets numbered 01-NN in dependency order (foundations first)
2. **Granularity**: Each ticket should be completable in 1-4 hours
3. **Dependencies**: Explicitly state which tickets depend on which
4. **Testability**: Each ticket must have verifiable DoD
5. **Filename format**: `NN-kebab-case-title.md`

## Constraints
{{MAX_TICKETS_CONSTRAINT}}

## Quality Checklist

Before outputting, verify:
- [ ] Tickets are in correct dependency order
- [ ] No circular dependencies
- [ ] Each ticket has clear DoD with checkboxes
- [ ] Affected files are specific, not generic
- [ ] Total ticket count respects constraints
