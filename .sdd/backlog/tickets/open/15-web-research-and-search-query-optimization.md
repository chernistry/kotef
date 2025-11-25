# Ticket: 15 Web Research & Search Query Optimization

Spec version: v1.2  
Context: `.sdd/project.md`, `.sdd/best_practices.md` (Two‑Tier Web Research, Security posture, Performance & Cost Guardrails), `Prompt_Engineering_Techniques_Comprehensive_Guide.md`, existing tooling in `src/tools/{web_search.ts,deep_research.ts}`, prompts in `src/agent/prompts/{search_query_optimizer.md,research_query_refiner.md,research_relevance_evaluator.md}`, and SDD bootstrap in `src/agent/graphs/sdd_orchestrator.ts`.  
Dependencies: Closed 01 (deep research feedback loops), 02 (planner and state research quality). Builds directly on those implementations.

## Objective & DoD

Make web research:

- **LLM‑driven and quality‑scored** (no more naive or hard‑coded heuristics),
- **safe and cost‑aware** (bounded retries, host allowlists, and graceful fallback), and
- **relevant to the user’s goal and tech stack**, so we avoid:
  - TypeScript/Node best practices for a Python GUI task,
  - stock video/YouTube links when we need CSS/HTML patterns,
  - or 400/403 errors from over‑long or malformed queries.

### Definition of Done

- [ ] All runtime search flows (SDD bootstrap + agent runtime) generate **search queries via LLM prompts**, not by passing the raw user goal or brittle heuristic expansions.
- [ ] Deep research uses a **multi‑attempt strategy with explicit relevance/coverage metrics**:
  - [ ] Each attempt is scored with `{ relevance, confidence, coverage, shouldRetry }`.
  - [ ] At most N attempts (default 3) are made; the best attempt is chosen based on a clear quality function.
  - [ ] If even the best attempt is below a minimum relevance threshold, the system:
    - [ ] lowers expectations (e.g. warns “web research weak; relying more on model prior”), and/or
    - [ ] routes to Snitch if SDD requires strong external grounding.
- [ ] `sdd_orchestrator.ts` uses:
  - [ ] A **stack‑aware query optimization step** that considers the synthesized `.sdd/project.md` (e.g. Python vs TS) and user goal.
  - [ ] `deepResearch` with the new feedback‑loop API instead of a model‑only research call.
- [ ] Prompt files:
  - [ ] `search_query_optimizer.md`, `research_query_refiner.md`, and `research_relevance_evaluator.md` are refactored per the Prompt Engineering Guide:
    - [ ] Clear sections: Task / Inputs / Constraints / Output schema.
    - [ ] Output is always raw JSON (no ``` fences), matching the TS parsers.
    - [ ] Prompts explicitly ask for metrics: relevance 0–1, confidence 0–1, coverage 0–1, and short natural‑language justifications.
- [ ] Run reports include:
  - [ ] The final query actually used for deep research.
  - [ ] The best attempt’s quality scores and short reasons.
  - [ ] Any warnings about poor or conflicting research.

## Implementation Sketch

### 1. Normalise Deep Research API

Refine `src/tools/deep_research.ts` to expose something like:

```ts
export interface ResearchQuality {
  query: string;
  relevance: number;   // 0–1
  confidence: number;  // 0–1
  coverage: number;    // 0–1
  attempts: number;
  reasons: string;
}

export interface DeepResearchResult {
  findings: DeepResearchFinding[];
  quality: ResearchQuality;
}

export async function deepResearch(
  config: Config,
  originalGoal: string,
  options?: { maxAttempts?: number; techStackHint?: string }
): Promise<DeepResearchResult> { /* ... */ }
```

Implementation details:

- For attempt 0:
  - Use `search_query_optimizer.md` to generate an initial English query from `(originalGoal, techStackHint, any SDD context)`.
- For subsequent attempts:
  - Use `research_query_refiner.md` with `(originalGoal, previousQuery, findings so far, quality)` to generate a new query if `shouldRetry` is true.
- After each attempt:
  - Score findings via `research_relevance_evaluator.md` into `(relevance, confidence, coverage, shouldRetry, reasons)`.
  - Maintain the best attempt by a simple scoring rule, e.g. `score = 0.5*relevance + 0.3*coverage + 0.2*confidence`.

### 2. Host Allowlist & Error Handling

In `src/tools/web_search.ts` and any HTTP fetchers:

- Introduce a simple configuration (from `.sdd/config.json` or environment) with:

```jsonc
{
  "web": {
    "allowedHosts": ["nodejs.org", "docs.python.org", "developer.mozilla.org", "stackoverflow.com", "vitejs.dev"],
    "blockedHosts": ["localhost", "127.0.0.1", "0.0.0.0"],
    "maxResults": 5
  }
}
```

- Before fetching each result, check host against this allowlist. Skip disallowed or suspicious targets.
- Handle 400/403 errors robustly:
  - If Tavily or provider returns 400 on a query, treat it as a failed search attempt and let `research_query_refiner` propose a shorter / simpler query for the next attempt.
  - Log the HTTP status and URL in structured logs but do **not** crash the overall SDD orchestration.

### 3. SDD Orchestrator Integration

In `src/agent/graphs/sdd_orchestrator.ts`:

- Replace any direct `callChat`/model‑only research paths with:

```ts
const techStackHint = inferStackFromGoalAndProject(goal, projectSpec); // e.g. "Python GUI", "Vite React frontend"
const researchResult = await deepResearch(config, goal, { maxAttempts: 3, techStackHint });
```

- Ensure that:
  - `.sdd/best_practices.md` is generated from `researchResult.findings`, not pure model hallucination.
  - Research quality is written somewhere SDD‑visible (e.g. in a short summary section at the top of `best_practices.md` or in a separate `.sdd/research-meta.json`).

### 4. Prompt Refactors

Refactor:

- `src/agent/prompts/search_query_optimizer.md`:
  - Task: turn (goal, techStackHint, relevant SDD snippets) into a **searchable English query** that is provider‑friendly (no over‑long or mixed‑language strings).
  - Inputs: user goal, any stack hints, existing best_practices snippets if present.
  - Output: JSON:

    ```json
    { "query": "string", "reason": "string", "expected_domains": ["string"] }
    ```

- `src/agent/prompts/research_query_refiner.md`:
  - Task: given `(originalGoal, previousQuery, brief summary of findings, quality scores)`, propose a revised query or decide not to retry.
  - Output: JSON:

    ```json
    { "query": "string", "should_retry": true, "reason": "string" }
    ```

- `src/agent/prompts/research_relevance_evaluator.md`:
  - Task: grade a research attempt.
  - Output: JSON:

    ```json
    {
      "relevance": 0.0,
      "confidence": 0.0,
      "coverage": 0.0,
      "should_retry": false,
      "reasons": "string"
    }
    ```

Ensure prompts explicitly:

- Disallow markdown fences around JSON.
- Ask the model to keep numeric scores in `[0,1]` with one decimal.
- Remind the model to **err on the side of “low confidence”** when sources are thin or conflicting.

### 5. Planner Awareness of Research Quality

Using existing state from ticket 02 (now closed):

- Ensure `plannerNode`:
  - Reads the latest `ResearchQuality` from state (populated by Researcher).
  - Avoids sending the user back to Researcher when:
    - `relevance >= 0.7 && coverage >= 0.6`, or
    - attempts ≥ `maxAttempts`.
  - Routes to Snitch instead when:
    - `relevance < 0.3` for all attempts **and** SDD requires external evidence (e.g. for high‑risk domains).

## Steps

1. **Normalize deep research API**
   - [ ] Refactor `deep_research.ts` to return `DeepResearchResult` with `quality`.
   - [ ] Implement internal retry loop using `search_query_optimizer`, `research_query_refiner`, and `research_relevance_evaluator`.

2. **Improve web_search error handling**
   - [ ] Add allowlist / blocklist support.
   - [ ] Treat HTTP 4xx/5xx as attempt‑local errors, not fatal run errors; log and continue.

3. **Wire SDD orchestrator to deep research**
   - [ ] Replace model‑only research calls with new `deepResearch` invocation.
   - [ ] Pass inferred `techStackHint` derived from the goal (Python/TS/React/etc.).

4. **Refactor prompts per guide**
   - [ ] Rewrite `search_query_optimizer.md`, `research_query_refiner.md`, `research_relevance_evaluator.md` with structured sections and JSON‑only outputs.
   - [ ] Double‑check with small dev examples that parsing works robustly (no fenced code blocks, no trailing commas).

5. **Planner integration**
   - [ ] Ensure Researcher updates state with `ResearchQuality`.
   - [ ] Update Planner prompt and node to use `ResearchQuality` to avoid redundant research calls and to escalate when research is hopeless.

6. **Run report & metrics**
   - [ ] Include final query and `ResearchQuality` summary in `.sdd/runs/*.md`.
   - [ ] Optionally, add counters for number of web calls and pages fetched to support future cost analysis.

## Affected Files / Modules

- `.sdd/best_practices.md` (structure of research summary section, optional)
- `src/tools/{web_search.ts,deep_research.ts}`
- `src/agent/graphs/sdd_orchestrator.ts`
- `src/agent/nodes/researcher.ts`
- `src/agent/prompts/{search_query_optimizer.md,research_query_refiner.md,research_relevance_evaluator.md}`
- `src/agent/run_report.ts`
- Tests under `test/tools/deep_research.test.ts` (new) and `test/agent/research_flow.test.ts` (new)

## Risks & Edge Cases

- Too strict thresholds may classify useful research as “bad” and over‑escalate. Start with lenient thresholds (e.g. relevance 0.6) and refine based on experience.
- Overuse of web search can become slow and expensive; this is mitigated by `maxAttempts`, allowlists, and profile‑aware behaviour (e.g. in `smoke` mode, maybe skip deep research).
- Provider behaviour (Tavily/Brave/etc.) may change; keep core logic provider‑agnostic and handle errors gracefully.

## Non‑Goals

- This ticket does **not** implement full RAG or vector‑database retrieval; it focuses on web search and focused page fetching.
- It does **not** redesign SDD content structure; only how we populate `best_practices.md` and research metadata.


