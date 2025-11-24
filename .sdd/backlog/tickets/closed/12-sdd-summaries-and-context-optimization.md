# Ticket: 12 SDD Summaries & Context Optimization for Planner/Coder

Spec version: v1.1  
Context: `.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md` (often 10–20k chars), runtime prompts in `src/agent/prompts/*.md`, LLM wrapper `src/core/llm.ts`, agent nodes `planner`/`coder`.  
Dependencies: none strict, but complements 10–11 (profiles, failure loops).

## Objective & DoD

Reduce **token usage and latency** per LLM call by introducing concise SDD summaries and reusing them across turns, while preserving semantic fidelity.

**Definition of Done**

- [ ] A summarization utility exists (e.g. `src/agent/sdd_summary.ts`) that:
  - [ ] Produces short SDD summaries (`project_summary`, `architect_summary`, `best_practices_summary`) from the full `.sdd/*.md` files.
  - [ ] Stores them in memory (and optionally in `.sdd/cache/summaries.json`) for reuse.
- [ ] `plannerNode` and `coderNode`:
  - [ ] Prefer the precomputed summaries in prompts instead of slicing raw SDD text every time.
  - [ ] Only fall back to full texts for very specific tasks (e.g. architecture refactors), and even then truncate aggressively.
- [ ] Token budgets for planner/coder are adjusted downward (e.g. 256–512 tokens per response) with no loss in decision quality on existing scenarios.
- [ ] A test demonstrates that:
  - [ ] With large `.sdd/architect.md` and `.sdd/best_practices.md`, the context passed into planner/coder stays within a reasonable size.
  - [ ] The agent still respects core SDD rules and makes sane decisions on a known scenario (e.g. hello-world).

## Implementation Sketch

```ts
// src/agent/sdd_summary.ts
export interface SddSummaries {
  projectSummary: string;
  architectSummary: string;
  bestPracticesSummary: string;
}

export async function buildSddSummaries(rootDir: string): Promise<SddSummaries> {
  // 1. Read .sdd/project.md, architect.md, best_practices.md
  // 2. Use a small LLM or simple heuristics to compress:
  //    - Extract goal, tech stack, DoD from project.md
  //    - Extract architecture overview, key decisions, constraints from architect.md
  //    - Extract main patterns/rules from best_practices.md
}
```

```ts
// src/agent/nodes/planner.ts (pseudo)
const { projectSummary, architectSummary, bestPracticesSummary } = state.sddSummaries ?? await buildSddSummaries(cfg.rootDir);

const replacements = {
  '{{SDD_PROJECT}}': projectSummary,
  '{{SDD_ARCHITECT}}': architectSummary,
  '{{SDD_BEST_PRACTICES}}': bestPracticesSummary,
  // ...
};
```

```ts
// src/agent/nodes/coder.ts – similar replacement; full SDD text becomes opt-in via read_file tool
```

## Steps

1. **Design summary format**
   - [ ] Define what must be present in each summary:
     - `projectSummary`: goal, tech stack, scope, DoD bullets.
     - `architectSummary`: architecture pattern(s), key components, constraints, quality gates.
     - `bestPracticesSummary`: stack-specific patterns, testing approach, cost/perf guardrails.
   - [ ] Document this in a short design comment in `sdd_summary.ts` or a doc block.

2. **Implement `buildSddSummaries`**
   - [ ] Read `project.md`, `architect.md`, `best_practices.md` from `.sdd/`.
   - [ ] For v1, implement a deterministic heuristic summarizer (no LLM) to avoid extra calls:
     - [ ] Extract specific headings and first N lines under them.
     - [ ] Trim and normalize whitespace.
   - [ ] Optionally (later), allow an LLM-based summarizer controlled by an env flag for richer summaries.

3. **Extend AgentState**
   - [ ] Add `sddSummaries?: SddSummaries` to `src/agent/state.ts`.
   - [ ] Add a channel in `src/agent/graph.ts` for `sddSummaries` with a simple “last write wins” reducer.

4. **Initialize summaries once per run**
   - [ ] In `src/cli.ts` when building `initialState`, compute `buildSddSummaries(rootDir)` and store in `initialState.sddSummaries`.
   - [ ] Alternatively, lazily compute in the first planner/coder invocation and cache in state.

5. **Wire summaries into prompts**
   - [ ] Update `plannerNode` replacements to use `state.sddSummaries` instead of slicing raw SDD (with a small fallback).
   - [ ] Update `coderNode` the same way.
   - [ ] Update `src/agent/prompts/planner.md` / `coder.md` text to remind the model that full SDD is available via `read_file` if needed.

6. **Tests & measurements**
   - [ ] Add `test/agent/sdd_summary.test.ts` that:
     - [ ] Uses a synthetic large `architect.md` / `best_practices.md`.
     - [ ] Asserts that summaries are below some size (e.g. < 2k chars each).
   - [ ] Add a test that runs a small mock graph with `callChat` in mock mode and asserts that:
     - [ ] The injected context strings for `{{SDD_*}}` are summaries, not full blobs.

## Affected Files / Modules

- `src/agent/sdd_summary.ts` (new)
- `src/agent/state.ts`
- `src/agent/graph.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/coder.ts`
- `src/agent/prompts/planner.md`
- `src/agent/prompts/coder.md`
- `test/agent/sdd_summary.test.ts` (new)

## Tests

```bash
npm test -- test/agent/sdd_summary.test.ts
```

## Risks & Edge Cases

- Over-aggressive summarization might hide important constraints (e.g. security rules). Mitigation: ensure summaries always include sections on constraints and non‑goals.
- If summaries are cached to disk, they may become stale when `.sdd/` changes; mitigation: include a simple invalidation strategy (e.g. compare mtime, or always recompute on each `kotef run` for now).

## Non‑Goals / Pitfalls to Avoid

- Do **not** attempt a full-blown RAG/vector store here; simple summarization is enough.
- Do **not** remove access to full `.sdd/*.md`; agent should still be able to `read_file` them when needed.
- Do **not** couple summary format tightly to current SDD wording; design it so it survives reasonable SDD refactors.

