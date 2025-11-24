# Ticket: 09 LLM Evaluation & Prompt Tuning Harness

Spec version: v1.0  
Context: `.sdd/project.md` (quality & evaluation goals), `.sdd/best_practices.md` (metrics, budgets),  
`allthedocs/learning/research/ai_engineering/Prompt_Engineering_Techniques_Comprehensive_Guide.md` (data-driven prompt optimization)  
Dependencies: 01-scaffold-core, 03-tools-search, 04-agent-graph, 08-runtime-prompts-hardening.

## Objective & DoD
Create a small, **data-driven evaluation harness** for kotef’s runtime prompts and LLM behavior so we can:
- compare prompt or model variants on a fixed dev set of coding tasks,
- detect regressions when prompts/models change,
- track basic metrics (success rate, groundedness, cost) over time.

**Definition of Done:**
- [ ] A lightweight dev set of 5–15 coding tasks defined under `devdata/` (e.g. small refactors, bug fixes, feature stubs) with:
  - [ ] each task having:
    - description (user goal),
    - minimal repo fixture (or path to fixture),
    - expected outcome description (e.g. “test X passes and function Y behaves like Z”).
- [ ] A script or CLI subcommand (e.g. `npm run eval:prompts`) that:
  - [ ] iterates over the dev set,
  - [ ] runs kotef in a controlled mode for each task (possibly with mocked LLM or cheaper models),
  - [ ] records outcomes (success/failure, time, tokens if available) to a JSON or CSV report.
- [ ] A simple metrics summary (e.g. Node script or small TS module) that:
  - [ ] aggregates results (success rate, average runtime, average calls) and prints them,
  - [ ] makes it easy to compare two prompt/model configs (e.g. “before vs after”).
- [ ] Documentation in `.sdd/best_practices.md` or `README.md` briefly describing how to run the eval and how to use it for prompt tuning.

## Implementation Sketch

```ts
// devdata/tasks/example.json
{
  "id": "01-add-function",
  "goal": "Implement add(a, b) in src/math.ts and ensure tests pass.",
  "fixtureDir": "devdata/fixtures/01-add-function",
  "expected": {
    "testsCommand": "npm test",
    "notes": "Should not modify other files."
  }
}
```

```ts
// scripts/eval_prompts.ts
import { spawn } from 'node:child_process';

async function runTask(taskId: string) {
  // 1) copy fixture to temp dir
  // 2) run `kotef run --root <tmp> --goal "<goal>" --max-time ...`
  // 3) observe exit code, diff size, test results
  // 4) write result to JSON
}
```

Alignment with the Prompt Engineering Guide:
- treat prompts as **policies** we evaluate empirically, not as static art;
- define clear metrics per task (e.g. “tests pass”, “no unexpected diffs”, “grounded answer”);
- allow switching between prompt/model profiles via config (e.g. `KOTEF_PROMPT_PROFILE`, `KOTEF_MODEL_PROFILE`) and run the eval under each profile.

You MAY:
- reuse code patterns from existing evaluation harnesses in other projects (if any) or from CI scripts in `navan`/`callquest`, adapting them to kotef’s CLI, as long as:
  - they are simplified and generalized,
  - any domain-specific checks are removed or generalized.

## Steps
1. Define 5–15 minimal coding tasks and fixtures under `devdata/`:
   - prefer tiny projects with fast tests,
   - cover a mix of tasks: new function, refactor, fix failing test, small feature.
2. Implement a script (TS or JS) to:
   - load task definitions,
   - for each task:
     - copy its fixture to a temp dir,
     - run kotef with appropriate flags (goal or ticket),
     - collect metrics (exit code, duration, maybe token usage if available from logs).
3. Define a simple result schema and write results to `devdata/results/<run-id>.json`.
4. Implement an aggregator that:
   - reads results files,
   - prints a short summary (success rate, mean duration, etc.).
5. Update docs (`README.md` or `.sdd/best_practices.md`) with:
   - how to run the eval,
   - how to interpret results when tuning prompts or switching models.

## Affected Files
- `devdata/tasks/*.json`
- `devdata/fixtures/**`
- `scripts/eval_prompts.ts` (or `src/scripts/eval_prompts.ts`)
- optional: `scripts/aggregate_eval.ts`
- `package.json` (add `eval:prompts` script)

## Tests
- Manual: run `npm run eval:prompts` locally and confirm it finishes and produces a report.
- Optional: add a small automated smoke test that runs a single task with a mocked or trivial LLM and asserts the harness works.

## Risks & Edge Cases
- Making the eval harness too heavy or slow; keep tasks small and fast.
- Overfitting prompts to this small dev set; use it as a regression/diagnostic tool, not as a full benchmark.
- Depending on real external APIs in eval; consider using cheaper models or partial mocking to keep cost acceptable.

## Non‑Goals / Pitfalls to Avoid
- Do **not** turn this into a full-blown benchmarking framework; focus on a pragmatic dev tool.
- Do **not** require special cloud infra; the eval should run on a local dev machine or CI runner.
- Do **not** entangle eval logic with core agent logic; keep the harness as a thin wrapper around the CLI. 

