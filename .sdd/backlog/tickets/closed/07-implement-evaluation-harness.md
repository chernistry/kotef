# Ticket: 07 Implement Persistent Evaluation Harness

Spec version: v1.0
Context: `critique.md` (Evaluation & Observability)

## Objective & DoD
Implement a persistent "offline" evaluation harness to measure agent performance on benchmark tasks.
**DoD:**
- A script `test/eval/harness.ts` exists.
- It runs a set of defined tasks (e.g., from `test/eval/benchmarks/`).
- It produces a report comparing current run metrics vs baseline.
- Metrics include: Success rate, Steps taken, Cost/Tokens, Code Quality Score (lint/test).

## Steps
1.  Create `test/eval/` directory structure.
2.  Define a `BenchmarkTask` interface (goal, expected outcome, constraints).
3.  Create 2-3 initial benchmark tasks (e.g., "Fix simple bug", "Add simple feature").
4.  Implement the harness script to run Kotef against these tasks (using a sandbox or temp dir).
5.  Implement scoring logic.

## Affected Files
-   `test/eval/*`

## Risks
-   Evals might be slow/expensive. Mitigation: Run them only on demand or nightly, not on every PR.
