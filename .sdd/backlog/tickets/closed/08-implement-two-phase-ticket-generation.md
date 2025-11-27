# Ticket: 08 Implement Two-Phase Ticket Generation

Spec version: v1.0
Context: `sdd_orchestrator.ts`, `orchestrator_tickets.md`

## Problem
Currently, all tickets are generated in a single JSON response. This causes several issues:
1.  **JSON Size**: The response grows exponentially (10-25KB for 5-10 tickets), leading to parsing errors.
2.  **Token Limits**: `sddTicketsMaxTokens` (2000) is insufficient for multiple full tickets, causing truncation.
3.  **Parsing Fragility**: Nested markdown in JSON requires heavy escaping, increasing syntax error rates.

## Objective & DoD
Refactor the ticket generation process to use a **Two-Phase Approach** (Option A).

**DoD:**
-   Phase 1: `sdd_orchestrator.ts` requests a compact list of tickets (`filename`, `title`, `summary`) from the LLM.
-   Phase 2: `sdd_orchestrator.ts` iterates through the list and requests the full content for *each* ticket individually.
-   The system handles 5+ tickets without JSON parsing errors or truncation.
-   Progress is logged (e.g., "Generating ticket 1/5...").

## Steps
1.  Update `src/agent/prompts/body/orchestrator_tickets.md` to support two modes:
    -   `PLAN_ONLY`: Returns list of `{ filename, title, summary }`.
    -   `GENERATE_SINGLE`: Returns full content for a specific ticket title/summary.
2.  Refactor `src/agent/graphs/sdd_orchestrator.ts` (or the relevant node) to implement the loop:
    -   Call LLM with `PLAN_ONLY`.
    -   Loop through results.
    -   Call LLM with `GENERATE_SINGLE` for each item.
    -   Save files incrementally.
3.  Verify by generating a large set of tickets (e.g., for a complex feature).

## Affected Files
-   `src/agent/prompts/body/orchestrator_tickets.md`
-   `src/agent/graphs/sdd_orchestrator.ts`

## Risks
-   Increased latency due to multiple serial LLM calls. Mitigation: Parallelize calls if possible (with concurrency limit), or just accept latency for reliability.
