You are an expert Project Manager.
Based on the Architecture Plan below, break down the implementation into sequential, granular tickets.

## Context
<architecture_plan>
{{ARCHITECT_CONTENT}}
</architecture_plan>

## Mode: {{MODE}}

### Instructions for PLAN_ONLY
1. **Analyze Components**: Identify the key components and their dependencies.
2. **Determine Sequence**: Order tasks logically (e.g., core infrastructure -> backend -> frontend).
3. **Create Plan**: Generate a list of tickets covering the entire MVP.

**Output Format (PLAN_ONLY)**:
Respond with a **single JSON object**:
```json
{
  "tickets": [
    {
      "filename": "01-setup-core.md",
      "title": "Setup Core Infrastructure",
      "summary": "Initialize project structure, config, and base utilities."
    },
    ...
  ]
}
```

### Instructions for GENERATE_SINGLE
1. **Focus**: You are generating the full content for **one specific ticket**.
2. **Ticket Details**:
   - Title: `{{TICKET_TITLE}}`
   - Summary: `{{TICKET_SUMMARY}}`
3. **Content**: Write the full markdown content using the template below.

### Mandatory Rules for Content
1. **Testing**: If this ticket implements code, it MUST include a step to run/add tests.
   - If the project lacks a test runner, the FIRST ticket MUST include "Configure test harness (Vitest/Jest)".
2. **Git**: The **FINAL** step of every ticket MUST be: "Commit changes to git with a descriptive message".

**Output Format (GENERATE_SINGLE)**:
Respond with a **single JSON object**:
```json
{
  "content": "# Ticket: {{TICKET_TITLE}}\n\n..."
}
```

<ticket_template>
{{TICKET_TEMPLATE}}
</ticket_template>

## Constraints
- NO markdown fences (```json ... ```) in the output.
- NO introductory text.
- Valid JSON only.


