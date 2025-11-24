# Ticket: 03 Tools – Web Search & Deep Research

Spec version: v1.0  
Context: `.sdd/project.md` (Two-tier web research), `.sdd/best_practices.md` Section “Priority 2 — Search & Deep Research Layer”, `.sdd/architect.md` Sections 3, 6.2  
Dependencies: 01-scaffold-core, 02-tools-fs.

## Objective & DoD
Implement web search and deep research capabilities by **adapting** existing Navan/CallQuest/Tavily modules into generic, provider-agnostic tools for kotef.

**Definition of Done:**
- [ ] `src/tools/web_search.ts` implemented: shallow search adapter with pluggable providers (Tavily/Serper/Brave) driven by config.
- [ ] `src/tools/fetch_page.ts` implemented: fetches URL, strips HTML to text, respects `robots.txt` and host allowlists.
- [ ] `src/tools/deep_research.ts` implemented: multi-step routine that takes a query, performs search → fetch → summarize with citations.
- [ ] Types `WebSearchResult`, `FetchedPage`, `DeepResearchFinding` are defined and stable.
- [ ] Basic in-memory caching is in place for search results and fetched pages, keyed by query/URL for the duration of a run, to honor performance & cost guardrails.
- [ ] Integration tests (mocked network) verify the shallow search and deep research flow.
- [ ] No Navan/CallQuest domain-specific types or copy-pasted prompt text; only patterns are reused.

## Implementation Sketch

```ts
// src/tools/web_search.ts
export interface WebSearchOptions {
  provider?: 'tavily' | 'brave' | 'serper';
  maxResults?: number;
}

export interface WebSearchResult {
  url: string;
  title: string;
  snippet?: string;
  source: string; // provider id
}

export async function webSearch(
  cfg: KotefConfig,
  query: string,
  options: WebSearchOptions = {},
): Promise<WebSearchResult[]> {
  // Thin adapter around existing search.ts/tavily_search.ts/brave_search.ts patterns.
}
```

```ts
// src/tools/fetch_page.ts
export interface FetchedPage {
  url: string;
  status: number;
  content: string;       // plain text
  contentType?: string;
}

export async function fetchPage(
  cfg: KotefConfig,
  url: string,
): Promise<FetchedPage> {
  // Enforce allowlist, robots.txt, timeouts; reuse Tavily project patterns.
}
```

```ts
// src/tools/deep_research.ts
export interface DeepResearchFinding {
  statement: string;
  citations: { url: string; title?: string; snippet?: string }[];
}

export async function deepResearch(
  cfg: KotefConfig,
  query: string,
): Promise<DeepResearchFinding[]> {
  // Shallow search → select top N → fetch pages → summarize via LLM.
}
```

The implementer MUST:
- study `finearts/callquest/root/src/tools/search.ts` and `navan/root/src/tools/{search,tavily_search,brave_search}.ts` for patterns (timeouts, resilience, result shaping);
- study `navan/root/src/core/deep_research.ts` for multi-step orchestration and adapt the algorithm, not the domain-specific outputs;
- align with scraping/allowlist practices from `personal_projects/tavily`.

## Steps
1. Define core types/interfaces (`WebSearchOptions`, `WebSearchResult`, `FetchedPage`, `DeepResearchFinding`) and ensure they are domain-agnostic.
2. Implement `webSearch`:
   - start with a single provider (e.g. Tavily or Serper) configurable via `KotefConfig`;
   - add explicit per-request timeout and error handling;
   - normalize all provider responses into `WebSearchResult[]`;
   - implement per-run caching keyed by `(provider, query)` to avoid duplicate calls when planner retries.
3. Implement `fetchPage`:
   - enforce host allowlist and block internal/unsafe hosts;
   - perform a basic `robots.txt` check (either via small library or simple disallow rules);
   - strip HTML to text (e.g. using a light DOM parser or regex for MVP) and limit max bytes;
   - cache page content by URL for the duration of a run.
4. Implement `deepResearch`:
   - call `webSearch` to get initial candidates;
   - for top N results, call `fetchPage`;
   - chunk long content and call `callChat` (from Ticket 01) to summarize with citations;
   - consult `KotefConfig.maxWebRequestsPerRun` and short-circuit with a partial answer if the budget is hit.
5. Add tests in `test/tools/search.test.ts`:
   - mock HTTP and provider APIs;
   - verify that allowlist/robots are checked;
   - verify that deepResearch returns findings with at least one citation per statement.

## Affected Files
- `src/tools/web_search.ts`
- `src/tools/fetch_page.ts`
- `src/tools/deep_research.ts`
- `test/tools/search.test.ts`

## Tests
```bash
npm test test/tools/search.test.ts
```

## Risks & Edge Cases
- Prompt injection via untrusted web content (must be mitigated in prompts and best practices; note for Architect/Agent tickets).
- Over-fetching (too many pages per query) leading to cost overruns.
- Handling of non-HTML content (PDFs, binaries) – should be explicitly rejected or handled via a later ticket.
