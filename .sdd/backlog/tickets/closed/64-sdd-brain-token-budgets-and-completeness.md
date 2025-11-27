# Ticket: 64 SDD brain token budgets and completeness

Spec version: v1.0 / kotef-sdd-brain-v1

## Context
- Project: `kotef` (spec-driven coding agent).
- Relevant SDD orchestration code:
  - `src/agent/bootstrap.ts`:
    - uses `renderBrainTemplate('bootstrap_project', ...)` + `callChat` to generate `.sdd/project.md`.
  - `src/agent/graphs/sdd_orchestrator.ts`:
    - `sddResearch` → generates `.sdd/best_practices.md` via `renderBrainTemplate('research', ...)` + `callChat` with:

      ```ts
      // Best practices doc: target ~15–20k chars (~3.5k tokens).
      maxTokens: 3500
      ```

    - `sddArchitect` → generates `.sdd/architect.md` via `renderBrainTemplate('architect', ...)` + `callChat` with:

      ```ts
      // Architecture spec: also ~15–20k chars, allow a bit more.
      maxTokens: 4000
      ```

    - `sddTickets` → generates tickets JSON with `maxTokens: 2000`.
- Observations/risks:
  - Best-practices and architecture docs are explicitly capped at roughly 3.5k/4k output tokens with a **fast** model.
  - Templates themselves are quite long (especially `research_template.md` and `architect_template.md`), leaving fewer tokens for actual content when rendered for rich stacks/domains.
  - For complex projects (multi-service, deep stack), these budgets can produce **truncated sections** (e.g., guide stops mid-section like `### Cost`), especially with verbose models or long context.
  - Token budgets for SDD generation are hard-coded:
    - not configurable via `.env` / `.sdd/config.json`;
    - not adapted to model context window (e.g., 128k vs 200k tokens).
  - There is no explicit completeness check:
    - we do not ask the model to confirm that all required sections are present;
    - we do not verify that output reaches a logical “end marker” (e.g., last section heading).

Impact:
- “Brain” docs (`project.md`, `best_practices.md`, `architect.md`) are first-class sources of truth.
- If they are truncated or incomplete, **all downstream behaviour** (tickets, planner, coder) inherits those omissions → “data poverty” and missing constraints.

## Objective & Definition of Done

Objective:
- Make SDD brain generation **token-budget-aware, configurable, and completeness-checked**, so that:
  - best-practices and architecture docs can leverage the full context window of the chosen model (within sensible limits);
  - token budgets are adjustable per deployment;
  - we detect and avoid truncated or obviously incomplete SDD docs.

### Definition of Done

- Configurable SDD token budgets:
  - [ ] `KotefConfig` (and `.env`/`.sdd/config.json`) is extended with explicit SDD brain fields, e.g.:

    ```ts
    interface KotefConfig {
      // existing...
      sddBrainModel?: string;          // default: modelStrong or modelFastStrong
      sddBestPracticesMaxTokens?: number; // default: 8000–16000
      sddArchitectMaxTokens?: number;     // default: 8000–16000
      sddTicketsMaxTokens?: number;       // default: 4000–8000
    }
    ```

  - [ ] If these fields are not set, sane defaults are chosen based on the model’s advertised context window (e.g., 128k tokens) and prompt size (e.g., target ≤ 1/3 of window for output).
- Brain generation uses these budgets:
  - [ ] `sddResearch` and `sddArchitect`:
    - use `cfg.sddBrainModel || cfg.modelStrong || cfg.modelFast` (prefer “stronger” model if available);
    - use `maxTokens: cfg.sddBestPracticesMaxTokens` / `cfg.sddArchitectMaxTokens` instead of hard-coded 3500/4000.
  - [ ] `sddTickets`:
    - uses `maxTokens: cfg.sddTicketsMaxTokens` instead of 2000;
    - still respects `response_format: { type: 'json_object' }`.
- Completeness checks:
  - [ ] After generating `.sdd/best_practices.md`:
    - a small post-check ensures that all required top-level headings from `research_template.md` (e.g., `1. TL;DR`, `2. Landscape`, `3. Architecture Patterns`, …) appear in the output;
    - if some are missing or the doc ends mid-heading/section:
      - log a warning;
      - optionally trigger a **regeneration pass** with a slightly adjusted prompt/suffix (see below).
  - [ ] Similarly, for `.sdd/architect.md`, we verify presence/order of key sections (Hard Constraints, Go/No-Go, Goals & Non-Goals, Metric Profile, Alternatives, Architecture Overview, etc.).
- Regeneration strategy:
  - [ ] If completeness checks fail and budgets allow:
    - SDD orchestrator can perform one additional regeneration attempt with:

      - a prompt suffix like “Your previous output was truncated or incomplete. Regenerate the **full document from the beginning**; do not reference earlier replies.”;
      - possibly a higher `maxTokens` bound (within config).
  - [ ] If regenerations still fail:
    - write the best attempt but:
      - append a clear `INCOMPLETE SECTION` marker at the end,
      - log a warning, and
      - encourage a follow-up SDD ticket (auto-generated or manual) for manual completion.

## Implementation Sketch

### 1. Add SDD brain config fields

- In `src/core/config.ts`:
  - extend `KotefConfigSchema` to include optional SDD fields with defaults;
  - read from env vars, e.g.:
    - `KOTEF_SDD_BRAIN_MODEL`,
    - `KOTEF_SDD_BEST_PRACTICES_MAX_TOKENS`,
    - `KOTEF_SDD_ARCHITECT_MAX_TOKENS`,
    - `KOTEF_SDD_TICKETS_MAX_TOKENS`.
- In `src/cli.ts`:
  - ensure CLI uses the updated config (no extra flags needed initially, but optional overrides could be added later).

### 2. Use SDD budgets in SDD orchestrator

- In `src/agent/graphs/sdd_orchestrator.ts`:
  - `sddResearch`:

    ```ts
    const response = await callChat(config, messages, {
      model: config.sddBrainModel || config.modelStrong || config.modelFast,
      temperature: 0,
      maxTokens: config.sddBestPracticesMaxTokens ?? 12000
    });
    ```

  - `sddArchitect`:

    ```ts
    const response = await callChat(config, messages, {
      model: config.sddBrainModel || config.modelStrong || config.modelFast,
      temperature: 0,
      maxTokens: config.sddArchitectMaxTokens ?? 12000
    });
    ```

  - `sddTickets`:

    ```ts
    const response = await callChat(config, messages, {
      model: config.sddBrainModel || config.modelFast,
      temperature: 0,
      maxTokens: config.sddTicketsMaxTokens ?? 4000,
      response_format: { type: 'json_object' }
    });
    ```

- Ensure `maxTokensPerRun` is not inadvertently constraining these calls; SDD generation should be allowed to consume a larger share of the run budget (or have a separate SDD-specific budget).

### 3. Add completeness validators

- Create `src/agent/utils/sdd_validation.ts`:

```ts
export interface SddDocValidationResult {
  ok: boolean;
  missingSections: string[];
  truncated?: boolean;
}

export function validateBestPracticesDoc(content: string): SddDocValidationResult { /* ... */ }
export function validateArchitectDoc(content: string): SddDocValidationResult { /* ... */ }
```

- Logic:
  - Maintain a list of expected headings from the templates (configurable / partial matches allowed).
  - Parse content line-by-line, track which headings appear.
  - Heuristically detect truncation:
    - doc ends immediately after a heading line;
    - last line is a partial markdown header or bullet;
    - content length is close to `maxTokens` * average chars/token (indicating model cut).
- In `sddResearch` / `sddArchitect`:
  - run validators on `content` before writing files;
  - if `!ok` and we haven’t retried yet:
    - log a warning with `missingSections`/`truncated`;
    - optionally run a regeneration attempt with a “fix truncated output” suffix and/or raised maxTokens.

### 4. Telemetry and SDD tickets

- On repeated failures or incomplete docs:
  - append a short note into `.sdd/issues.md` via Snitch or a small helper:
    - “SDD brain generation produced incomplete best_practices.md; missing sections: X, Y.”
  - optionally auto-create a small ticket “Complete best_practices.md for <project> manually.”

## Steps

1. **Config layer**
   - [ ] Add SDD brain config fields to `KotefConfig` and env parsing.
2. **Token budgets**
   - [ ] Update SDD orchestrator (`sddResearch`, `sddArchitect`, `sddTickets`) to use config-driven `maxTokens` and an appropriate model (prefer strong).
3. **Validation**
   - [ ] Implement `sdd_validation.ts` with best-practices and architect doc validators.
   - [ ] Integrate validation and simple regeneration loop into SDD orchestrator.
4. **Telemetry**
   - [ ] Log completeness problems and optionally write to `.sdd/issues.md` / auto-ticket.
5. **Tests**
   - [ ] Extend `test/agent/sdd_orchestrator.test.ts` to cover:
     - generation with default budgets;
     - simulated truncated outputs validating as incomplete;
     - config overrides for large docs.

## Affected files / modules
- `src/core/config.ts`
- `src/cli.ts`
- `src/agent/graphs/sdd_orchestrator.ts`
- `src/agent/utils/sdd_validation.ts` (new)
- `src/agent/nodes/snitch.ts` (optional, for auto-issues)
- Tests:
  - `test/agent/sdd_orchestrator.test.ts`

## Risks & Edge Cases
- Very verbose models might still hit context/length limits:
  - Mitigation: provide clear instructions in templates to be comprehensive but avoid unbounded verbosity; still rely on config-driven `maxTokens`.
- Over-aggressive validation:
  - Mitigation: keep validation heuristic, not hard-fail; allow “partial but useful” docs, but surface issues to the user.

## Dependencies
- Upstream:
  - 07-sdd-bootstrap.md
  - 21-eval-harness-and-regression-suite.md (for regression testing of SDD generation).
- Downstream:
  - Tickets related to SDD summarization and caching (e.g., sdd_summary) can assume richer brain docs are available.

