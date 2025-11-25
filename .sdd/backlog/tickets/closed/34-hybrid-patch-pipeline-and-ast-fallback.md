# Ticket: 34 Hybrid Patch Pipeline & AST Fallback

Spec version: v1.3  
Context: `.sdd/architect.md` (Tools / FS & editing), `.sdd/context/arch_refactor.md` (sections 4.1–4.2, 6.6), previous hardening tickets 26 (patch generation) and 27 (preflight verification), current FS tooling in `src/tools/fs.ts`.  
Dependencies: 19, 26, 27, 33.

## Objective & Definition of Done

Make code edits **more robust and less brittle** by:

- keeping unified diffs as the primary edit mechanism, but
- introducing a **hybrid patch pipeline** that:
  - first attempts a strict unified diff apply,
  - then falls back to a more tolerant text diff (`diff-match-patch`) or AST‑based patch for TypeScript/JS when appropriate.

### Definition of Done

- [ ] `writePatch` (or a new wrapper) supports a two‑stage patch application flow:
  - [ ] Stage 1: strict unified diff using the existing `diff` library, with current validations (no markdown, no `<tool_call>`).
  - [ ] Stage 2: for eligible files (e.g. `.ts`, `.tsx`, `.js`, `.jsx`), a fallback:
    - [ ] either via `diff-match-patch` on text regions, or
    - [ ] via AST manipulation (using the index from Ticket 33).
- [ ] The fallback is **opt‑in** and used only when:
  - [ ] the unified diff fails to apply, and
  - [ ] the patch is small and clearly localized (e.g. imports/function body).
- [ ] When both stages fail, the system:
  - [ ] returns a clear, actionable error to Coder,
  - [ ] increments failure counters for loop detection, and
  - [ ] suggests switching strategy (e.g. read file → rewrite full function via `write_file`).

## Steps

1. **Evaluate patch libraries**
   - [ ] Add `diff-match-patch` as a dependency (or another battle‑tested diff/patch library).
   - [ ] For TS/JS, consider using `ts-morph` (from Ticket 33) to apply certain structural edits (e.g. add/remove imports, rename symbols).

2. **Refactor `writePatch`**
   - [ ] Split `writePatch` into:
     - [ ] a strict unified‑diff path,
     - [ ] a fallback path.
   - [ ] Keep existing safety checks (no markdown fences, no tool_call tags, path validation).
   - [ ] Log which path was used for each successful patch.

3. **Implement fallback logic**
   - [ ] For text fallback:
     - [ ] use `diff-match-patch` to compute and apply patches on top of the current file content,
     - [ ] ensure the resulting file is syntactically valid where possible (Verifier will still run).
   - [ ] For AST fallback (optional for MVP):
     - [ ] provide helpers that can:
       - [ ] insert/remove imports,
       - [ ] wrap/unwrap code blocks,
       - [ ] rename identifiers.

4. **Node & prompt integration**
   - [ ] Update `coderNode` logging to:
     - [ ] differentiate between strict and fallback patch successes/failures,
     - [ ] update `fileChanges` consistently.
   - [ ] Update `src/agent/prompts/coder.md` to:
     - [ ] remind the model that malformed patches will be rejected,
     - [ ] encourage minimal diffs even with more tolerant fallback logic.

5. **Tests**
   - [ ] Add `test/tools/fs_hybrid_patch.test.ts`:
     - [ ] cases where a valid unified diff applies as before,
     - [ ] cases where a slightly stale diff fails strict apply but is rescued by fallback (e.g. added blank lines),
     - [ ] ensure non‑code files (.md, .json) remain on strict diffs only.
   - [ ] Ensure that failures bubble up clearly to Coder and Verifier in agent tests.

## Affected files/modules

- `.sdd/architect.md` (FS & editing)
- `.sdd/best_practices.md` (diff‑first editing section)
- `src/tools/fs.ts`
- `src/agent/nodes/coder.ts`
- `src/agent/prompts/coder.md`
- `test/tools/fs_hybrid_patch.test.ts` (new)
- `test/agent/coder_profile.test.ts` / `coder` flow tests (verify no regressions).

## Tests

- `npm test -- test/tools/fs_hybrid_patch.test.ts`
- `npm test -- test/agent/coder_profile.test.ts`

## Risks & Edge Cases

- More tolerant patching could hide real conflicts; mitigate by:
  - keeping fallback narrow in scope (small patches, TS/JS only),
  - relying on Verifier + LSP to catch semantic/syntax issues.
- AST‑based edits are more complex and may require additional libraries; start with text‑based fallback and add AST operations incrementally.

## Dependencies

- Upstream:
  - 19‑performance‑and‑tool‑efficiency‑optimizations
  - 26‑patch‑generation‑hardening‑and‑structured‑edit‑path
  - 27‑preflight‑verification‑and‑syntax‑sanity‑for‑edits
  - 33‑code‑context‑retrieval‑and‑file‑read‑caching
- Downstream:
  - 35‑supervisor‑level‑progress‑controller‑and‑stuck‑handler (uses improved signals about patch failures)


