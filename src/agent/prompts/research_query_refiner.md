Task: Refine a web search query for software‑engineering best‑practices research.

You will receive:
- Original user goal.
- Previous search query.
- A short quality summary of that attempt (scores + reasons).
- A short summary of the search results (titles + URLs).

Your job:
- Produce ONE improved English search query (8–16 words) that is more likely to return high‑quality, code‑oriented, up‑to‑date resources for this goal.

Guidelines:
- Keep library / framework / tool names as‑is (e.g. tkinter, flet, react, typescript, langgraph, pyqt6, pyside6).
- Preserve all critical constraints from the goal (language, framework, platform like macOS / web / CLI, “modern 2025 best practices”, animation, sound, etc.).
- If previous results were mostly:
  - YouTube / video content → bias toward “code example”, “tutorial”, “official docs”, “API reference”.
  - Stock assets / images → emphasise “css”, “html”, “javascript example”, “open source”.
  - Too generic → add qualifiers like “implementation”, “step by step”, “production best practices”.
- Remove any redundant words from the previous query; keep it concise and focused.

Input:
- Original goal:
{goal}

- Previous query:
{previousQuery}

- Previous research quality (relevance / confidence / coverage, reasons):
{qualitySummary}

- Search results summary:
{resultsSummary}

Output:
- ONE line with ONLY the new optimized search query (no quotes, no JSON, no bullet points).
- 8–16 words; lowercase; use spaces and hyphens only (no other punctuation).

