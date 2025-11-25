# Ticket: 04 agentic-best-practices-integration

Spec version: v1.0 / architect.md

## Context
- kotef’s architecture already follows several best practices from `agentic_systems_building_best_practices.md`:
  - Clear separation of roles: planner → researcher → coder → verifier → snitch.
  - SDD‑driven “brain” (`brain/templates/*`) vs per‑project `.sdd/` artifacts.
  - Tool‑using coding agent with filesystem + command tools.
- There are still gaps compared to the best‑practices doc and the synapse / sddrush ideas:
  - Limited telemetry / metrics on agent decisions (e.g., why planner chose a certain node, success/fail reasons).
  - No lightweight “agent dashboard” summarizing runs beyond `.sdd/runs/*.md`.
  - Incomplete feedback loops between nodes (e.g., verifier → planner → researcher for “spec is wrong, re‑think”, beyond basic error handling).
  - No explicit benchmarks / test suite for assessing agent performance over a set of coding tasks.

## Objective & Definition of Done
**Objective:** Align kotef more closely with modern agentic‑systems best practices by improving feedback loops, observability, and evaluation, without over‑engineering for v0.1.

**Definition of Done:**
- Feedback loops:
  - Clear patterns documented for:
    - `coder` signalling “architecture/spec mismatch” to `snitch` / `.sdd/issues.md`.
    - `verifier` signalling persistent test failures back to `planner` and, when appropriate, back to `researcher`/`architect`.
  - At least one end‑to‑end scenario where a failing change triggers a structured issue and a follow‑up run fixes it.
- Observability:
  - Minimal but structured run‑level metrics (e.g., number of tool calls, web requests, LLM calls, runtime duration) captured in run reports and/or logs.
  - Clear stop conditions and reasons in run reports (why the agent stopped: done, yolo‑limit, recursion limit, spec conflict, etc.).
- Evaluation:
  - A small “agent eval” directory (e.g., `devdata/eval/`) with 3–5 canonical tasks (Python GUI app, HTML flag, small TS refactor, etc.).
  - A script (or extension of existing ones) to run kotef on these tasks and summarize high‑level metrics (success, partial, fail, time).

## Steps
1. Re‑read `agentic_systems_building_best_practices.md` with an eye on:
   - Feedback loops between roles.
   - Observability and metrics.
   - Evaluation / benchmarking patterns (e.g., AgentBoard‑style breakdown).
2. Design a minimal extension to current run reporting:
   - Extend `src/agent/run_report.ts` to include metrics like tool‑call counts, research attempts, planner decisions, stop reason.
   - Ensure this stays lightweight and doesn’t require external services.
3. Strengthen feedback loops:
   - Make sure `snitch` entries in `.sdd/issues.md` include enough context for a follow‑up run (goal, failing module, suspicion: spec vs impl vs tests).
   - Clarify in prompts (planner/verifier) when to escalate vs when to keep iterating.
4. Add a tiny evaluation harness:
   - A script (or extension to `scripts/eval_prompts.ts`) that:
     - Runs kotef in a temp sandbox for a handful of predefined goals.
     - Produces a single concise summary file (e.g., `devdata/eval/latest.json`) with success/failure stats.
5. Optionally, add 1–2 GitHub issues / docs notes describing how to extend this into a more formal AgentBoard‑style evaluation later.

## Affected files/modules
- `src/agent/run_report.ts`
- `src/agent/graph.ts`
- `src/agent/prompts/planner.md`, `src/agent/prompts/verifier.md`, `src/agent/prompts/coder.md`
- `.sdd/issues.md` format (if extended)
- `scripts/*` and `devdata/eval/*` (new)

## Tests
- Manual runs on sample goals to verify:
  - Metrics appear in run reports.
  - Feedback loops behave as documented (e.g., repeated failures lead to a clear stop + issue).
- Optionally, a minimal automated check that the eval script completes without throwing.

## Risks & Edge Cases
- Over‑collecting metrics could clutter run reports; keep the initial set small and high‑signal.
- Feedback loops must avoid new planner recursion loops; use explicit stop rules.

## Dependencies
- Builds on existing run reporting and the planner/snitch nodes.
- Complements Tickets 01–03 by making their behaviour observable and measurable.

