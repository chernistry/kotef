# Ticket: 09 Enforce Git and Testing in Ticket Generation

Spec version: v1.0
Context: `orchestrator_tickets.md`

## Problem
Analysis of `run.log` reveals that the agent:
1.  **Fails to commit changes**: The repo remains in the initial state despite file creation.
2.  **Skips testing**: No test scripts or dependencies were added to `package.json`.

This happens because the generated tickets do not explicitly require these steps, and the agent optimizes for "completing the ticket" which currently just means "writing the code".

## Objective & DoD
Update the ticket generation prompt to ensure *every* implementation ticket includes mandatory steps for Git and Testing.

**DoD:**
-   Generated tickets MUST have a "Verification" section that includes:
    -   "Run automated tests".
    -   "Commit changes with a descriptive message".
-   Generated tickets MUST have a DoD item: "All changes committed to git".
-   If the project lacks tests, the first ticket MUST include "Setup testing framework (Vitest/Jest)".

## Steps
1.  Update `src/agent/prompts/body/orchestrator_tickets.md`:
    -   Add a rule: "ALWAYS include a final step: 'Commit changes to git'."
    -   Add a rule: "If `package.json` exists but lacks `test` script, the first ticket MUST include 'Configure test harness'."
    -   Update the few-shot examples to show tickets with these steps.

## Affected Files
-   `src/agent/prompts/body/orchestrator_tickets.md`

## Risks
-   Agent might commit broken code if tests fail. Mitigation: The step order should be "Verify (Test)" -> "Commit".
