# Ticket: 31 Diagnostics Log & Error-Aware Planning

Spec version: v1.3  
Context: `.sdd/architect.md` (Agent Layer / state, Verifier), `.sdd/best_practices.md` (Goal‑First DoD, error‑first debugging), `.sdd/context/arch_refactor.md` (sections 6.2–6.4), runtime state in `src/agent/state.ts`, nodes `planner.ts`, `coder.ts`, `verifier.ts`.  
Dependencies: 11 (failure feedback loop), 14 (flow & stop rules), 17 (goal‑aware verification), 19 (performance), 27 (preflight verification).

## Objective & Definition of Done

Introduce a **first‑class diagnostics log** in agent state and use it to make Planner and Coder error‑aware, so that:

- repeated failures are tracked and summarized instead of re‑discovered on every loop,
- Planner always sees the *current* set of top errors and their history,
- Coder is guided to fix the most important diagnostics first (e.g. top compiler/test errors).

### Definition of Done

- [ ] `AgentState` includes a `diagnosticsLog` structure that:
  - [ ] records normalized diagnostics from Verifier (tests, builds, lint/typecheck),
  - [ ] optionally includes LSP diagnostics once available (see Ticket 32),
  - [ ] keeps at least:
    - `source` (`test`, `build`, `lint`, `lsp`, `runtime`),
    - `file` (if any),
    - `location` (line/column or range),
    - `message`,
    - `firstSeenAt` / `lastSeenAt`,
    - `occurrenceCount`.
- [ ] Verifier Node:
  - [ ] writes diagnostics from each command into `diagnosticsLog`,
  - [ ] produces a concise **primary failure summary** (e.g. “TypeScript compile error in src/foo.ts: Cannot find module...”).
- [ ] Planner Node:
  - [ ] includes a summarized view of `diagnosticsLog` in its prompt (top‑N current errors),
  - [ ] uses this to:
    - [ ] avoid routing back to Verifier without meaningful changes,
    - [ ] plan steps that target specific files/modules with errors.
- [ ] Coder Node:
  - [ ] receives the same summarized diagnostics in its prompt context,
  - [ ] is instructed (in `coder.md`) to fix errors in **priority order** (e.g. most blocking compile error first).
- [ ] Run reports include a short diagnostics section (top errors, how they evolved during the run).

## Steps

1. **Design diagnostics schema**
   - [ ] Add a `DiagnosticsEntry` interface in `src/agent/state.ts` or a new `diagnostics.ts` util:

```ts
export interface DiagnosticsEntry {
  source: 'test' | 'build' | 'lint' | 'lsp' | 'runtime';
  file?: string;
  location?: { line: number; column?: number };
  message: string;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrenceCount: number;
}
```

   - [ ] Add `diagnosticsLog?: DiagnosticsEntry[]` to `AgentState`.

2. **Populate diagnostics from Verifier**
   - [ ] Extend `src/agent/nodes/verifier.ts`:
     - [ ] after each command run, parse `stdout`/`stderr` into one or more `DiagnosticsEntry` instances (even if coarse‑grained at first),
     - [ ] deduplicate repeated messages by updating `occurrenceCount` and `lastSeenAt`.
   - [ ] Keep the parsing simple initially:
     - [ ] for tests: associate failure lines with `source: 'test'`,
     - [ ] for `tsc`/`vite`/`webpack`: mark as `source: 'build'` with message prefix.

3. **Summarization helpers**
   - [ ] Create `src/agent/utils/diagnostics.ts` with helper functions:
     - [ ] `summarizeDiagnostics(log, maxEntries)` → short text for prompts,
     - [ ] `getPrimaryFailure(log)` → one canonical error to show in planner/coder prompts.

4. **Planner integration**
   - [ ] Update `plannerNode` to:
     - [ ] include `summarizeDiagnostics(...)` in the prompt replacements (truncated as needed),
     - [ ] adjust decision rules to:
       - [ ] avoid planner↔verifier loops when diagnostics have not changed across iterations,
       - [ ] prefer routing to Coder with a clear “fix this error first” instruction.
   - [ ] Update `src/agent/prompts/planner.md` to:
     - [ ] mention diagnostics explicitly,
     - [ ] instruct the model to use them for planning rather than re‑running tests blindly.

5. **Coder integration**
   - [ ] Update `coderNode` to:
     - [ ] thread diagnostics summary into the system prompt replacements (`{{DIAGNOSTICS}}` or similar),
     - [ ] encourage error‑first fixes (already aligned with Ticket 24, but now with better signals).
   - [ ] Update `src/agent/prompts/coder.md` to:
     - [ ] describe `diagnosticsLog` as a primary input for choosing what to fix.

6. **Run reports & SDD alignment**
   - [ ] Extend run report generation (if present) to include:
     - [ ] a small “Diagnostics timeline” section,
     - [ ] link to this ticket and to `.sdd/best_practices.md` error‑first policy.
   - [ ] Optionally add a subsection to `.sdd/architect.md` clarifying diagnostics as a first‑class state channel.

7. **Tests**
   - [ ] Add `test/agent/diagnostics_log.test.ts` with scenarios:
     - [ ] a failing test populates `diagnosticsLog` with at least one entry,
     - [ ] repeated failures increment `occurrenceCount` rather than appending duplicates,
     - [ ] planner sees diagnostics in its prompt (can be asserted via prompt loader or mock).

## Affected files/modules

- `.sdd/architect.md` (Agent Layer / state & diagnostics)
- `.sdd/best_practices.md` (error‑first debugging section)
- `src/agent/state.ts`
- `src/agent/utils/diagnostics.ts` (new)
- `src/agent/nodes/verifier.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/coder.ts`
- `src/agent/prompts/planner.md`
- `src/agent/prompts/coder.md`
- `test/agent/diagnostics_log.test.ts` (new)

## Tests

- `npm test -- test/agent/diagnostics_log.test.ts`
- `npm test -- test/agent/verification_*`
- `npm test -- test/agent/flow_stop_rules.test.ts`

## Risks & Edge Cases

- Over‑aggressive summarization might hide important details; mitigate by:
  - keeping full logs in `testResults`,
  - making `diagnosticsLog` a condensed view, not the only source of truth.
- Poor parsing heuristics for non‑Node stacks could mislabel errors; start with TypeScript/JS focus and treat others as `runtime` until more specific parsers are added.
- Larger state (diagnostics arrays) could slightly increase prompt size; use summarization and truncation to control it.

## Dependencies

- Upstream:
  - 11‑failure‑feedback‑loop‑and‑bounded‑fix‑cycles
  - 14‑agent‑flow‑and‑stop‑rules‑hardening
  - 17‑goal‑aware‑verification‑and‑test‑selection
  - 19‑performance‑and‑tool‑efficiency‑optimizations
  - 27‑preflight‑verification‑and‑syntax‑sanity‑for‑edits
  - 30‑command‑runner‑and‑package‑manager‑detection
- Downstream:
  - 32‑lsp‑diagnostics‑and‑advanced‑verification
  - 35‑supervisor‑level‑progress‑controller‑and‑stuck‑handler


