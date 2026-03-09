<context>
<goal>{{GOAL}}</goal>
<architect>{{ARCHITECT_CONTENT}}</architect>
<code_map>{{CODE_MAP}}</code_map>
<ticket_limit>{{MAX_TICKETS_CONSTRAINT}}</ticket_limit>
</context>

<mission>
Generate the implementation backlog as machine-readable XML tickets for `.sdd/backlog/open/`.
</mission>

<instructions>
1. Respect the architect document, scope appetite, and any explicit "do not" constraints from the goal.
2. Sequence tickets in dependency order.
3. Keep tickets execution-ready for an agent with file and tool access.
4. Prefer surgical tickets for Small appetite; avoid setup/foundation churn unless the architect explicitly requires it.
5. Include Janitor Signals so the implementation agent knows when to create follow-up cleanup tickets.
</instructions>

<output_format>
Return raw XML only. No markdown fences. No commentary.

<tickets>
  <ticket filename="01-example.md" title="Example Ticket">
  # Ticket: 01 Example Ticket

  Spec version: v2.0
  Context: [link or architect section]

  ## Objective & DoD
  ...

  ### Definition of Done
  - [ ] ...

  ## Steps
  1. ...

  ## Affected Files
  - path/to/file.ts - reason

  ## Tests
  - ...

  ## Risks & Non-Goals
  - Risk: ... - Mitigation: ...
  - Non-goal: ...

  ## Dependencies
  - Depends on: ...
  - Blocks: ...

  ## Janitor Signals
  - Create follow-up ticket if ...
  </ticket>
</tickets>
</output_format>
