# Ticket: 29 Prompt Hardening & Policy Alignment

Spec version: v1.3  
Context: `.sdd/architect.md`, `.sdd/best_practices.md`, runtime prompts under `src/agent/prompts`, SDD templates under `brain/templates`, external prompt references in `prompts/CL4R1T4S/*` and `prompts/cursor/*`.  
Dependencies: 13 (goal‑first DoD), 19 (budgets & efficiency), 24 (error‑first execution), 25 (loop detection), 28 (functional probes & goal‑first verification v2).

## Objective & Definition of Done

Bring Kotef’s runtime prompts up to the standard of modern coding agents (Cursor, Claude, Codex, Same Dev) while staying faithful to SDD and the existing LangGraph architecture:

- Make planner/researcher/coder/verifier prompts:
  - explicitly **error‑first**, **diff‑first**, and **budget‑aware**,
  - consistent with loop‑detection and goal‑first DoD semantics,
  - strict about JSON‑only outputs and schema adherence.
- Align prompts with actual tools and state (e.g. `run_diagnostic`, `apply_edits`, `FUNCTIONAL_OK`, loop counters).
- Integrate best practices from reference prompts (tool usage rules, injection defense, output formatting) without importing their environment‑specific quirks.

### Definition of Done

- [ ] All runtime prompts (`meta_agent`, `planner`, `researcher`, `coder`, `verifier`, `research_query_refiner`, `research_relevance_evaluator`, `search_query_optimizer`) are:
  - [ ] Internally consistent with the node implementations in `src/agent/nodes/*.ts` (no mention of non‑existent tools or state fields).
  - [ ] Explicit about:
    - error‑first diagnostics,
    - diff‑first code edits and patch rules,
    - loop/budget awareness,
    - JSON‑only outputs with clear shapes.
  - [ ] Free of truncation/formatting artefacts (no stray `## Patch Rules` glitches, `***`, etc.).
- [ ] Research‑related prompts (researcher + refiner + evaluator + optimizer) explicitly:
  - [ ] treat web content as untrusted and defend against prompt injection,
  - [ ] prefer authoritative sources, and
  - [ ] define when to retry vs stop.
- [ ] Verifier prompt:
  - [ ] Reflects goal‑first semantics and partial‑success logic used by `verifierNode` and planner (including `done_partial`).
  - [ ] Matches the JSON contract expected by `verifierNode` (status/summary/next/terminalStatus).
- [ ] Planner prompt:
  - [ ] Mentions budgets, loop counters, and `FUNCTIONAL_OK`,
  - [ ] Guides the model to avoid low‑value loops and to use partial/aborted terminal statuses appropriately.
- [ ] Coder prompt:
  - [ ] Clearly explains `run_diagnostic`, `apply_edits`, and patch rules,
  - [ ] Emphasises error‑first diagnostics, minimal diffs, and budget‑aware behaviour.
- [ ] A short internal doc or SDD note references the external prompt sources used for inspiration, so future work can repeat or extend this exercise.

## Steps

1. **Audit existing prompts**
   - [ ] Read all prompts in `src/agent/prompts/*.md` and relevant templates in `brain/templates/*.md`.
   - [ ] Compare against reference prompts from `prompts/CL4R1T4S/*` and `prompts/cursor/*`.
   - [ ] List gaps: missing policies (error‑first, budgets), weak JSON contracts, injection defenses, or misaligned tool descriptions.

2. **Refactor runtime prompts**
   - [ ] Update `meta_agent.md` to describe the LangGraph flow, SDD law, error‑first/diff‑first behaviour, and high‑level policies.
   - [ ] Rewrite `coder.md` to:
     - [ ] document all tools actually exposed (`read_file`, `list_files`, `write_file`, `write_patch`, `apply_edits`, `run_command`, `run_tests`, `run_diagnostic`),
     - [ ] encode error‑first, diff‑first, and budget awareness,
     - [ ] provide clear patch rules and a JSON‑only output contract.
   - [ ] Tighten `planner.md` to:
     - [ ] explicitly mention budgets, loop counters, and `FUNCTIONAL_OK`,
     - [ ] clarify when to select `done` vs `snitch` vs `ask_human`.
   - [ ] Harden `researcher.md` and search prompts with injection defense and source selection guidelines.
   - [ ] Align `verifier.md` with goal‑first DoD and partial success semantics.

3. **JSON contract validation**
   - [ ] Ensure each prompt:
     - [ ] spells out a single JSON object shape (example, not schema),
     - [ ] forbids markdown fences and extra text,
     - [ ] matches what the corresponding node code expects to parse.
   - [ ] Add/adjust tests in `test/core/prompts.test.ts` and, if helpful, new tests under `test/agent/*` to ensure prompts still load and contain key markers.

4. **SDD & docs alignment**
   - [ ] Add a short section or note in `.sdd/architect.md` describing:
     - [ ] the role prompts play in enforcing policies (error‑first, diff‑first, goal‑first),
     - [ ] the fact that prompts are derived from and must respect SDD rules.
   - [ ] Optionally add a brief `docs/prompts.md` summarising how to evolve prompts safely.

5. **Regression check**
   - [ ] Run targeted tests (at least `test/core/prompts.test.ts` and a small agent flow test) to ensure no runtime breakage.
   - [ ] If available, run a couple of eval scenarios (`scripts/eval/run_eval.ts`) to spot regressions in behaviour.

## Affected files/modules
- `src/agent/prompts/meta_agent.md`
- `src/agent/prompts/planner.md`
- `src/agent/prompts/researcher.md`
- `src/agent/prompts/coder.md`
- `src/agent/prompts/verifier.md`
- `src/agent/prompts/research_query_refiner.md`
- `src/agent/prompts/research_relevance_evaluator.md`
- `src/agent/prompts/search_query_optimizer.md`
- `brain/templates/agent_template.md` (optional refresh for SDD orchestrator)
- `.sdd/architect.md` (small note referencing prompt policies)
- Tests under `test/core/` and `test/agent/` as needed.

## Tests
- `npm test -- test/core/prompts.test.ts`
- A small agent flow test (e.g. `test/agent/sdd_orchestrator.test.ts` or `test/agent/graph.test.ts`) to ensure prompts parse and basic flows still work.
- Optional: run one or two eval scenarios via `npm run eval -- --scenario <id>` to sanity‑check behaviour.

## Risks & Edge Cases
- Over‑constraining prompts could make the model too rigid or verbose; mitigated by keeping instructions minimal but concrete.
- Divergence between prompt contracts and node parsing logic could cause runtime errors; mitigated by tests and carefully matching JSON shapes.
- External prompt patterns might drag in environment‑specific assumptions (Cursor/Same/Claude); mitigated by adapting, not copying, and staying aligned with `.sdd/architect.md`.

## Dependencies
- Ticket 13 (goal‑first DoD) for high‑level semantics.
- Ticket 19 (budgets) for command/test/web limits.
- Ticket 24 (error‑first execution) and 25 (loop detection) for behavioural expectations.
- Ticket 28 (functional probes & goal‑first verification v2) for `FUNCTIONAL_OK` semantics.

