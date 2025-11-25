Task: Score how good the current web research results are for a software‑engineering goal.

You will receive:
- Original user goal (may be non‑English, but already roughly translated in the query).
- The search query that was used.
- A short summary of the search results (titles + URLs).
- A JSON preview of the current research findings (statements + citations).

Your job:
1. Judge how relevant the findings are to the goal.
2. Judge how confident you are that they are technically correct and up‑to‑date (as of 2025).
3. Judge how actionable / complete they are for implementing the goal (do they give enough concrete guidance, patterns, or examples to code the thing).
4. Decide whether the agent should retry web search with a refined query.

Heuristics (guidance, not hard rules):
- Relevance should be HIGH (≥ 0.8) only if the findings clearly match the requested language / framework / platform and focus on the actual task (not generic intros or unrelated content).
- Confidence should be HIGH (≥ 0.8) only if sources look reputable (official docs, well‑known blogs, StackOverflow, etc.) and not low‑signal content (random YouTube with no code, stock assets, SEO spam).
- Coverage should be HIGH (≥ 0.8) only if there are enough concrete findings to actually implement the goal end‑to‑end (key APIs, patterns, edge cases, testing, perf / security notes where relevant).
- Set shouldRetry = true if:
  - relevance < 0.7 OR coverage < 0.7, OR
  - most sources are videos / stock assets with no code / no best‑practice discussion, OR
  - the findings are clearly generic and not specific to the requested tech stack.

Input:
- Goal:
{goal}

- Search query:
{query}

- Search results (titles + URLs):
{resultsSummary}

- Current findings JSON (preview):
{findingsJson}

Output:
- Return ONLY a single JSON object (no markdown fences, no additional text) with this exact schema:
{
  "relevance": number,          // 0.0–1.0
  "confidence": number,         // 0.0–1.0
  "coverage": number,           // 0.0–1.0
  "shouldRetry": boolean,       // true if a better query is likely to help
  "reasons": string             // short explanation (1–3 sentences)
}

Rules:
- Be conservative: if unsure, lower the scores and set shouldRetry = true.
- Never include comments, explanations, or multiple JSON objects. Output exactly one JSON object.

