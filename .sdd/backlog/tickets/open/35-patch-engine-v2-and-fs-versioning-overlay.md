# Ticket: 35 Patch engine v2 & FS versioning overlay

Spec version: v1.0  
Context: `.sdd/architect.md` (Tools Layer → fs.ts; Diff-first editing / safety), `.sdd/best_practices.md` (unified diffs, dry-run), `.sdd/context/arch_refactor.md` (Sections 3, 4.1–4.2).

## Context
- `src/tools/fs.ts` currently uses the `diff` library to apply unified diffs (`writePatch`), with:
  - validation against markdown / `<tool_call>` artefacts,
  - a hard failure when patch application fails.
- External research points to:
  - using `diff-match-patch` or AST-based patching as a smarter fallback when textual diffs fail,
  - adding **FS versioning** / in-memory overlays (`memfs`, git-like snapshots) for dry-runs and easy rollback.

## Objective & Definition of Done

Upgrade the patching layer to:
- Provide a **second chance** when a unified diff fails:
  - either via `diff-match-patch`,
  - or via minimal AST-based patching for supported languages (TS/JS).
- Offer an optional **FS overlay** mode where patches are applied to an in-memory filesystem first, enabling:
  - safe experimentation,
  - diff previews,
  - easier rollback on verifier failures.

DoD:
- A refactored patch engine that:
  - first tries strict unified diff application (current behaviour),
  - if that fails, optionally falls back to a best-effort patch engine (configurable).
- An FS overlay abstraction that can be toggled per run:
  - `real` vs `overlay` mode,
  - in overlay mode, the agent can run tests against the in-memory view without touching disk (where practical).

## Steps
1. **Refactor patch application into a dedicated module**
   - Create `src/tools/patch_engine.ts` with:
     - `applyUnifiedDiff(path, diff)`,
     - `applyFallbackPatch(path, original, diff)` (implementation TBD),
     - `applyPatchWithFallback(path, diff, options)`.
   - Move existing validation logic from `fs.ts` into this module.

2. **Introduce diff-match-patch fallback**
   - Integrate `diff-match-patch` (or similar) to compute a patch when unified diff fails:
     - take the original and the “intended” target (if available) or reconstruct from diff content,
     - apply small, local patches.
   - Ensure we keep safety constraints (no patching outside root, no random text injection).

3. **FS overlay abstraction**
   - Introduce an FS context interface, e.g.:
     - `FsAdapter` with `readFile`, `writeFile`, `listFiles`, etc.
   - Implement:
     - `RealFsAdapter` (current behaviour),
     - `OverlayFsAdapter` using `memfs` (or similar) layered over real FS.
   - Allow `KotefConfig` / CLI to choose overlay vs real FS for a run (e.g. `--fs-mode=overlay|real`).

4. **Integrate with tools and nodes**
   - Wire `coder`’s `write_patch`, `write_file`, and `apply_edits` to use the patch engine + FS adapter.
   - Ensure that Verifier runs against the correct FS view:
     - in overlay mode, tests should see patched files (may require mounting overlay or syncing to a temp dir).

5. **Config & SDD updates**
   - Add config fields in `KotefConfig` and `.sdd/architect.md`:
     - `fsMode`, `enablePatchFallback`, `maxFallbackPatchSize`, etc.
   - Document trade-offs (safety vs complexity vs performance).

6. **Tests**
   - Add tests under `test/tools/patch_engine.test.ts` for:
     - successful unified diff application,
     - fallback path when unified diff fails,
     - overlay vs real FS behaviours.
   - Update existing tests (`test/tools/fs_patch.test.ts`, `test/tools/fs.test.ts`) to use the new module where appropriate.

## Affected files/modules
- `src/tools/patch_engine.ts` (new).
- `src/tools/fs.ts` (refactor to delegate to patch engine).
- `src/agent/nodes/coder.ts` (if tool behaviour changes).
- `src/core/config.ts` / CLI (overlay mode flags).
- Tests under `test/tools/*` and `test/agent/*`.

## Tests
- `npm test -- test/tools/patch_engine.test.ts`
- `npm test -- test/tools/fs_patch.test.ts`

## Risks & Edge Cases
- **Silent patch drift**:
  - Fallback patching must not introduce unintended large changes; mitigate via size checks and diff previews.
- **Overlay complexity**:
  - FS overlays can confuse tools that rely on absolute paths; start with conservative use and explicit flags.

## Dependencies
- Builds on: Ticket 26 (patch generation hardening) and existing FS tooling.
- Upstream for: future tickets that might introduce git-level versioning or more advanced AST patching.

