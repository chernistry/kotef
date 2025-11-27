# Ticket: 65 Deep research and SDD summarization data preservation

Spec version: v1.0 / kotef-research-data-v1

## Context
- Deep research pipeline:
  - `src/tools/deep_research.ts`:
    - `webSearch` + `fetchPage` → `summarizeFindings` → `scoreResearchAttempt` → `refineResearchQuery` loops.
    - `summarizeFindings` instructs an LLM to extract key findings + citations with `maxTokens: 2000`.
    - `scoreResearchAttempt` and another relevance evaluator use `maxTokens: 300`/similar.
    - `searchResultsSummary` is truncated to 2000 chars.
    - Best attempt is selected by a weighted relevance/coverage/confidence score.
  - SDD orchestrator (`src/agent/graphs/sdd_orchestrator.ts`):
    - passes only the **synthesized findings** into the best-practices template:

      ```ts
      const findingsContext = findings.length === 0
         ? "No external web findings..."
         : findings.map(...).join("\n\n");
      ```

    - calls LLM with `maxTokens: 3500` to generate `.sdd/best_practices.md`.
- SDD summarization:
  - `src/agent/sdd_summary.ts`:
    - takes full `.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md`;
    - truncates content to first 15000 chars for prompting:

      ```ts
      const prompt = promptTemplate.replace('{{CONTENT}}', content.slice(0, 15000));
      ```

    - uses `maxTokens: 512` for summaries;
    - these summaries are injected into Planner/Coder prompts to reduce token usage.
- Risk:
  - Deep research and SDD summarization involve multiple **lossy steps**:
    - web pages → `summarizeFindings` (JSON statements),
    - findings → best_practices doc,
    - SDD docs → `sdd_summary` (512-token summary),
    - SDD summaries → Planner/Coder prompts.
  - While each step is reasonable, there is no explicit guarantee that:
    - important constraints or risks are not systematically “washed out” by repeated compression;
    - enough raw context is kept somewhere durable so that subsequent runs can re-derive rich information if needed.
  - For large SDD docs, slicing to 15000 characters may omit late sections (e.g. Tech Debt, ADR index) from summaries.

Goal:
- Ensure deep research + SDD summarization **never “impoverish” data** at the system level:
  - keep raw context in durable form;
  - consciously separate “display/LLM prompt summaries” from “ground-truth knowledge”;
  - make compression knobs explicit and configurable.

## Objective & Definition of Done

Objective:
- Harden deep research and SDD summarization so that:
  - rich sources (web pages, SDD docs) are always preserved in raw or lightly-structured form;
  - every lossy summary step is:
    - clearly labeled as such,
    - configurable (depth, length),
    - optional for flows that require full fidelity;
  - agents can **fall back to richer context** when summaries are insufficient.

### Definition of Done

- Deep research:
  - [ ] `deepResearch` returns a **richer structure**:

    ```ts
    export interface DeepResearchResult {
      findings: DeepResearchFinding[];           // as today
      quality: ...;
      rawSearchResults?: WebSearchResult[];      // URLs, titles, snippets
      rawPagesSample?: { url: string; content: string }[]; // truncated per-page content, with clear limits
    }
    ```

  - [ ] SDD orchestrator’s `findingsContext` is built from `findings`, but:
    - raw search metadata and a few representative page excerpts are saved into a `.sdd/context/*.md` or JSON sidecar (e.g. `.sdd/context/deep_research_<goal_hash>.md`), so they can be revisited without re-searching.
  - [ ] `maxTokens` and page truncation sizes used in deep research (2000 for findings, 300 for scoring, ~snippet sizes) are:
    - exposed via config (e.g. `deepResearchMaxTokens`, `deepResearchPageSnippetChars`, `deepResearchMaxFindings`);
    - tuned to avoid over-aggressive compression for complex topics.

- SDD summarization:
  - [ ] `sdd_summary.ts`:
    - uses configurable limits for input slice and summary length, e.g.:

      ```ts
      sddSummaryInputChars?: number; // default 15000–30000
      sddSummaryMaxTokens?: number;  // default 512–1024
      ```

    - is **only** used for prompt context (Planner/Coder) and clearly documented as such.
  - [ ] For flows requiring full fidelity (e.g. SDD brain editing, human review, or secondary agents), we never rely solely on summaries—full `.sdd/*.md` remain the canonical source.

- Prompt and flow audit:
  - [ ] Audit of prompts that embed SDD or research content (Planner, Coder, Researcher, Verifier) is performed to ensure:
    - they either:
      - call out explicitly that SDD snippets are truncated/summarized, and instruct the agent to call `read_file` on `.sdd/*` when bigger decisions are needed;
      - or (for small SDD docs) pass the full content.
  - [ ] Any instructions that encourage “over-compression” without fallback (e.g. “only keep 3 bullets from this doc” when context is cheap) are revisited and, where appropriate, relaxed.

## Implementation Sketch

### 1. Enrich DeepResearchResult and persistence

- In `src/tools/deep_research.ts`:
  - extend `DeepResearchResult` with `rawSearchResults` and `rawPagesSample` fields;
  - when running the web search:
    - keep the original structured results (URLs, titles, snippets);
    - for each of the `topPages`, keep a truncated content snippet (e.g. first 4–8KB).
  - Cap total stored raw size to keep memory usage reasonable.
- SDD orchestrator:
  - extend `SddOrchestratorState` with a `researchRawContext?: string` or structured field;
  - after deep research, write a context file, e.g.:

    - `.sdd/context/deep_research_<goal_hash>.md` or `.json`

  - ensure this file includes:
    - goal,
    - summary of findings,
    - list of URLs,
    - a few representative page excerpts to give future runs more colour if needed.

### 2. Configurable research budgets

- In `src/core/config.ts`:
  - add optional deep research fields:

    ```ts
    deepResearchMaxTokens?: number;          // for findings
    deepResearchMaxPages?: number;
    deepResearchPageSnippetChars?: number;   // per page, default ~4000
    ```

  - wire them into `deepResearch` to replace hard-coded 2000/300 etc where appropriate.

### 3. SDD summary config and usage

- In `src/agent/sdd_summary.ts`:
  - replace `content.slice(0, 15000)` with a config-driven limit (`cfg.sddSummaryInputChars ?? 15000`);
  - use `cfg.sddSummaryMaxTokens ?? 512` for `maxTokens`, allowing experiments with richer summaries.
- Ensure only Planner/Coder/Researcher/Verifier call SDD summaries; SDD brain generation and human-oriented flows must use full `.sdd/*.md`.

### 4. Prompt audit and guardrails

- Review:
  - `src/agent/prompts/body/planner.md`
  - `src/agent/prompts/body/coder.md`
  - `src/agent/prompts/body/researcher.md`
  - `src/agent/prompts/body/verifier.md`
  - `src/agent/prompts/brain/*` where they reference SDD snippets.
- Ensure prompts:
  - explicitly mention that SDD snippets may be truncated summaries;
  - instruct agent to use `read_file` on `.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md`, and relevant tickets for major decisions or when context appears incomplete.

## Steps

1. **Deep research data model**
   - [ ] Extend `DeepResearchResult` with raw data fields.
   - [ ] Cap and persist raw research snippets into `.sdd/context/`.
2. **Deep research config**
   - [ ] Add config fields for research token/page budgets and wire them into `deep_research.ts`.
3. **SDD summary config**
   - [ ] Make SDD summary input length and output tokens configurable via `KotefConfig`.
4. **Prompt audit**
   - [ ] Update Planner/Coder/Researcher/Verifier prompts to:
     - clearly state when SDD/research snippets are summaries;
     - encourage fallback to full files when needed.
5. **Tests**
   - [ ] Add/extend tests to verify:
     - deepResearch still behaves within budgets but preserves raw context;
     - SDD summaries stay within configured limits but do not affect stored SDD docs.

## Affected files / modules
- `src/tools/deep_research.ts`
- `src/core/config.ts`
- `src/agent/sdd_summary.ts`
- `src/agent/graphs/sdd_orchestrator.ts` (for context persistence)
- `src/agent/prompts/body/{planner.md,coder.md,researcher.md,verifier.md}`
- `.sdd/context/*` (new files per project)
- Tests under `test/tools/deep_research_*` and `test/agent/sdd_summary.test.ts`

## Risks & Edge Cases
- Storing too much raw context (disk usage, privacy):
  - Mitigation: cap snippet sizes and number of stored pages; allow config to disable raw context persistence for sensitive projects.
- Increased costs:
  - Mitigation: keep research token budgets conservative by default; allow tuning upwards only when necessary.

## Dependencies
- Upstream:
  - 15-web-research-and-search-query-optimization.md
  - 21-eval-harness-and-regression-suite.md
- Downstream:
  - Future tickets for richer “research audit” UIs can rely on preserved raw context.

