# Ticket: 21 Eval Harness & Regression Suite for Agent Behaviour

Spec version: v1.2  
Context: `.sdd/architect.md` (Goals & Non‑Goals, metrics), `.sdd/best_practices.md` (Metrics & evaluation), `agentic_systems_building_best_practices.md` (evaluation frameworks, AgentBench/AgentBoard), existing run reports under `.sdd/runs/`, and core agent graph.  
Dependencies: 14–20 (so that evaluation runs against hardened behaviour).

## Objective & DoD

Create a **small but representative evaluation harness** that can be run locally or in CI to detect regressions in:

- flow stability (no infinite loops),
- correctness for typical goals,
- research quality,
- and performance (time, commands, web calls).

### Definition of Done

- [ ] A `scripts/eval` (or similar) directory contains:
  - [ ] A small set (5–10) of **canonical tasks**, e.g.:
    - “Create a Python Tkinter GUI with a window and Close button.”
    - “Fix Vite import errors for missing `useI18n` hook.”
    - “Create an HTML/CSS/JS page drawing a dynamic Israeli flag.”
    - “Add a simple Fastify route with tests.”
  - [ ] A harness script that:
    - runs kotef on these tasks in a **temporary sandbox**,
    - collects `.sdd/runs/*` reports,
    - extracts key metrics (success/partial/aborted, loops, tool counts).
- [ ] An evaluation summary is produced (even if only printed to console) with:
  - [ ] pass/fail per scenario,
  - [ ] basic metrics: steps, commands, tests, web calls.
- [ ] A GitHub Actions (or similar) workflow can execute this harness and surface failures.

## Implementation Sketch

### 1. Scenario Definitions

Create `scripts/eval/scenarios/*.json` with entries like:

```json
{
  "id": "python_gui_close_button",
  "goal": "Create a Python GUI application for macOS using tkinter with a window and Close button",
  "profile": "fast",
  "scope": "tiny"
}
```

Include scenarios based on real failures observed in logs.

### 2. Harness Script

Add `scripts/eval/run_eval.ts`:

- For each scenario:
  - Create a temp sandbox (e.g. under `/tmp/kotef-eval-<id>`).
  - Copy a minimal fixture repo into the sandbox (placed under `scripts/eval/fixtures/<scenario>`).
  - Run `node bin/kotef run --root <sandbox> --goal "<goal>" --profile <profile> [--yolo]`.
  - Parse the latest `.sdd/runs/*.md` to extract:
    - terminal status,
    - tool budgets,
    - loop counters,
    - success/partial/aborted and reason.

### 3. Metrics & Thresholds

Define, in code or SDD:

- Acceptable thresholds per scenario, e.g.:
  - No `GraphRecursionError`.
  - terminalStatus in {`done_success`,`done_partial`} for happy‑path tasks.
  - CommandsUsed < 80, WebRequests < 30.
  - No `planner_researcher_loop` or `planner_verifier_loop` stop reasons in these canonical tasks.

The harness should:

- Summarise metrics and highlight any scenario that violates thresholds.

### 4. CI Integration

Add a GitHub Actions job (or equivalent) that:

- installs dependencies,
- runs `npm test` as usual,
- runs `npm run eval` (hooked to `run_eval.ts`),
- fails the workflow if any scenario fails thresholds.

## Steps

1. **Design fixture repos**
   - [ ] Create minimal fixture projects under `scripts/eval/fixtures` for each scenario.

2. **Define scenarios**
   - [ ] Add JSON scenario definitions.

3. **Implement harness**
   - [ ] Implement `run_eval.ts` with CLI options (e.g. `--scenario <id>`).
   - [ ] Implement run report parsing and metric extraction.

4. **Define thresholds**
   - [ ] Document thresholds in `.sdd/architect.md` or a small `eval.md`.

5. **Wire CI**
   - [ ] Add workflow to run eval harness and surface failures.

## Affected Files / Modules

- `scripts/eval/fixtures/*` (new)
- `scripts/eval/scenarios/*.json` (new)
- `scripts/eval/run_eval.ts` (new)
- `.github/workflows/eval.yml` (optional)
- `.sdd/architect.md` (evaluation section)

## Risks & Edge Cases

- Scenarios may become stale as the codebase changes; keep them focused on core flows (bootstrap SDD, simple coding tasks, typical error repair).

## Non‑Goals

- This ticket does **not** attempt to integrate external benchmarks like AgentBench/ToolBench; it focuses on project‑specific smoke‑test evaluation.


