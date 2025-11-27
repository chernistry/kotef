# Ticket: 63 Auto-Generate Tickets for Large Goals

Spec version: v1.0
Context: `cli.ts` startup logic

## Objective
Fix the user frustration where `kotef run` fails for large goals if no tickets exist. Instead of exiting, the agent should automatically invoke the SDD Orchestrator to generate tickets and then proceed.

## Definition of Done
- [ ] `kotef run` with a large goal and no tickets does NOT exit with error.
- [ ] It automatically calls `runSddOrchestration` to generate tickets.
- [ ] It verifies tickets were created.
- [ ] It proceeds to run the agent (picking the first ticket or general planning).

## Implementation Steps
1.  **Modify `src/cli.ts`**:
    -   Import `runSddOrchestration`.
    -   In the "Ticket Requirement Check" block:
        -   If `openTickets.length === 0`:
            -   Log "Auto-generating tickets...".
            -   Call `runSddOrchestration`.
            -   Re-scan `openTickets`.
            -   If still empty, exit.
            -   Else, continue.

## Affected Files
-   `src/cli.ts`

## Risks
-   **Infinite Loop**: If orchestrator fails to create tickets but doesn't throw, we might loop? *Mitigation*: The re-scan check handles this.
-   **Latency**: Orchestration takes time. *Mitigation*: Log clearly what is happening.
