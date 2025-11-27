# Ticket: 66 Diff‑Match‑Patch fallback for hybrid patch pipeline

Spec version: v1.0 / kotef-patch-pipeline-v3

## Context
- Project: `kotef` — spec‑driven coding agent that applies **small, reversible diffs** to real projects.
- Current patch pipeline:
  - Implemented in `src/tools/fs.ts`:
    - Stage 1: strict unified diff via `Diff.applyPatch` from the `diff` library (`fast-glob` + `diff`).
    - Stage 2: custom **fuzzy patch fallback** for small code files:
      - parses unified diff into hunks (`parseUnifiedDiffHunks`),
      - computes `expected`/`replacement` strings per hunk,
      - tries to locate `expected` in the file via a home‑grown line similarity (`findBestFuzzyMatch`, `computeLineSimilarity`, `stringSimilarity`),
      - replaces at the best‑guess position when similarity ≥ 0.6.
  - Tests:
    - `test/tools/fs_hybrid_patch.test.ts` exercises:
      - strict unified diff success,
      - simple fuzzy fallback cases (whitespace/context drift),
      - guardrails (no fuzzy for non‑code files, large patches).
- Existing SDD tickets:
  - 26‑patch‑generation‑hardening‑and‑structured‑edit‑path (`fs` validation, AST path),
  - 34‑hybrid‑patch‑pipeline‑and‑ast‑fallback,
  - 35‑patch‑engine‑v2‑and‑fs‑versioning‑overlay.
  - These introduced:
    - strict diff checks,
    - hybrid patching (diff + structured edits),
    - versioning overlays and safety rails.
- Agentic best practices (`agentic_systems_building_best_practices.md` and `.sdd/context/sd.md`) emphasize:
  - **small, reversible changes** with fast feedback (DORA/Continuous Delivery),
  - robust patch engines that:
    - avoid silent corruption,
    - prefer deterministic, well‑tested libraries over ad‑hoc heuristics,
    - leave a clear audit trail for what changed and why.

Problem:
- The current fuzzy fallback is **ad‑hoc** and line‑based:
  - custom similarity functions are not battle‑tested,
  - may mis‑locate hunks in tricky cases (reordered code blocks, similar contexts),
  - not grounded in a standard diff/patch algorithm.
- There is **no dedicated diff‑match‑patch fallback** (e.g. Neil Fraser’s algorithm) despite:
  - its wide use for robust text patching,
  - its ability to tolerate local context shifts while still minimizing unintended edits.

We want a safer, more principled second stage: when strict unified diff fails, use a **proper diff‑match‑patch‑style fallback** for small patches instead of our own fuzzy matcher.

## Objective & Definition of Done

Objective:
- Replace the custom fuzzy patch fallback with a **standard diff‑match‑patch (DMP)** based fallback for code files, while keeping:
  - Stage 1 strict unified diff behaviour intact,
  - existing safety rails (file type gating, patch size limits),
  - clear logging and metrics about fallback usage and failures.

### Definition of Done

- Patch pipeline behaviour:
  - [ ] Stage 1 (strict unified diff):
    - unchanged: try `Diff.applyPatch` with the provided unified diff; if it succeeds, write result and return.
  - [ ] Stage 2 (DMP fallback):
    - when Stage 1 fails **and** file is eligible (e.g. `.ts`, `.tsx`, `.js`, `.jsx`) and patch is small:
      - use a **diff‑match‑patch** implementation (JS/TS library) to locate and apply the patch more robustly, instead of the current `findBestFuzzyMatch` approach.
    - non‑code files, large patches, or files explicitly excluded:
      - do **not** use DMP; return a clear error (“fuzzy fallback not available”) as today.
  - [ ] Behaviour must be deterministic given the same original content + diff:
    - no non‑deterministic heuristics or random scoring.

- DMP integration:
  - [ ] Introduce a small adapter module (e.g. `src/tools/diff_match_patch_adapter.ts`) that wraps chosen DMP library:

    ```ts
    export interface DmpHunk {
      expected: string;
      replacement: string;
    }

    export function applyDmpHunks(
      original: string,
      hunks: DmpHunk[]
    ): string { /* uses diff‑match‑patch under the hood */ }
    ```

  - [ ] Existing unified diff parsing (`parseUnifiedDiffHunks`) is reused to produce `expected`/`replacement` segments per hunk; DMP is used to:
    - locate best insertion points in `original`,
    - compute patch objects and apply them safely.
  - [ ] Fallback preserves:
    - context lines,
    - multiple hunks per file,
    - ordering semantics (we should not reorder hunks).

- Safety & constraints:
  - [ ] DMP fallback is only attempted when:
    - patch is “small” (e.g. < 50 changed lines as today, configurable),
    - the file size is below a safe threshold (e.g. < 1 MB, aligned with `readFile` limit),
    - file extension is in a whitelist (`.ts/.tsx/.js/.jsx`, potentially extendable via config).
  - [ ] If DMP application fails (e.g. ambiguity too high, patch object reports failure):
    - a clear error is thrown with context (`file path`, first 1–2 hunks, reason),
    - no partial writes are performed (all‑or‑nothing semantics).
  - [ ] Patch validation rules (no ``` fences, no `<tool_call>` wrappers, unified diff format checks) remain unchanged.

- Observability & metrics:
  - [ ] Logging:
    - when DMP fallback is used, log at info level:
      - file, patch size (changed lines), DMP success/failure,
      - whether DMP changed the file or decided “no‑op”.
    - on DMP failure, include a concise summary for the Snitch/failure history.
  - [ ] Tests:
    - update/extend `fs_hybrid_patch.test.ts` to cover:
      - successful DMP fallback cases with context drift (e.g. added comments above/below the hunk),
      - multi‑hunk patches where only some hunks shift in the file,
      - negative cases (too large patches, non‑code files, ambiguous matches).

## Implementation Sketch

### 1. Choose and integrate a DMP library

- Candidate libraries:
  - `diff-match-patch` (npm), or a thin TS wrapper around Google’s reference implementation.
- Adapter design:
  - Keep the adapter small and pure (string→string), no FS concerns.
  - Adapter responsibilities:
    - from an `original` string and a list of `(expected, replacement)` hunks, build DMP patches in sequence:
      - for each hunk:
        - use DMP’s `diff_main`/`patch_make` to compute a patch for `expected→replacement`,
        - apply to the current working version of the text,
        - verify patch size & result sanity (e.g. ensure expected text was replaced only once).
    - propagate errors if DMP reports unapplyable patches or too many mismatches.

### 2. Replace custom fuzzy logic with DMP in fs.ts

- In `src/tools/fs.ts`:
  - Keep Stage 1 as is (`Diff.applyPatch`).
  - In Stage 2:
    - remove or narrow the `applyFuzzyPatch` / `findBestFuzzyMatch` implementation,
    - instead, call `applyDmpHunks(originalContent, hunks)` from the adapter when `shouldAttemptFuzzyPatch(diffContent)` returns true.
  - Ensure `shouldAttemptFuzzyPatch` (or new helper) enforces:
    - changed lines < threshold,
    - appropriate file extension checks,
    - guard against very large original files.

### 3. Configurability and future extension

- Optional config fields in `KotefConfig` (or a small patch config object):

```ts
patchFuzzyMaxChangedLines?: number;  // default 50
patchFuzzyEnabledExtensions?: string[]; // default ['.ts', '.tsx', '.js', '.jsx']
```

- This ticket can start with constants (as today) and mention config as a follow‑up if needed.

### 4. Tests and regression safety

- Extend `test/tools/fs_hybrid_patch.test.ts`:
  - Add scenarios where:
    - code around the target hunk is reindented or has added comments;
    - there are two very similar occurrences of the same snippet, and ensure DMP picks the correct one (or fails clearly).
  - Verify:
    - strict diff success path untouched,
    - DMP fallback runs and yields expected content,
    - non‑code files still reject fuzzy fallback.
- Keep existing tests that assert failure when both strict and fallback fail; just adjust expectations for error messages if needed.

## Affected files / modules
- `src/tools/fs.ts` (patch pipeline)
- `src/tools/diff_match_patch_adapter.ts` (new)
- `src/core/config.ts` (optional, if making thresholds configurable)
- Tests:
  - `test/tools/fs_hybrid_patch.test.ts`
  - `test/tools/fs_patch.test.ts` (if expectations around errors change)

## Risks & Edge Cases
- DMP mis‑locating hunks in pathological cases:
  - Mitigation:
    - keep patch size limits; reject ambiguous large patches,
    - require high match thresholds and conservative application,
    - prefer failing fast to silently mutating wrong regions.
- Performance on large files:
  - Mitigation:
    - enforce file size & change size limits,
    - do not use DMP fallback for huge files.
- Additional dependency footprint:
  - Mitigation:
    - wrap the library in a narrow adapter,
    - ensure no browser‑only features are used (Node‑friendly only).

## Dependencies
- Upstream:
  - 26‑patch‑generation‑hardening‑and‑structured‑edit‑path.md
  - 34‑hybrid‑patch‑pipeline‑and‑ast‑fallback.md
  - 35‑patch‑engine‑v2‑and‑fs‑versioning‑overlay.md
- Downstream:
  - future tickets related to “patch conflict resolution” or “multi‑file atomic patching” can assume DMP fallback is available and well‑tested.

