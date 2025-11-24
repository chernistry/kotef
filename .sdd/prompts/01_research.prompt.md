# Best Practices Research Template (Improved)

Instruction for AI: produce a practical, evidence‑backed best practices guide tailored to this project and stack.

---

## Project Context
- Project: kotef
- Description: # Project Description

kotef — autonomous coding & research agent that uses SDD as its “brain”.

The goal is to build a production‑grade AI coding/search agent (similar to Claude Code / Q / ChatGPT Code) that:
- plans and reasons via SDD artifacts (`project.md`, `best_practices.md`, `architect.md`, tickets);
- uses web search + focused scraping to ground decisions;
- edits real codebases with strong safety, observability, and feedback loops.

## Core
- Primary goal: turn SDD + existing search/scraping code into a reusable agentic framework for coding and deep web research on arbitrary projects.
- Users/personas: individual developer (Sasha), future team members, and automated CI bots using kotef as a coding assistant.
- Key constraints (tech, org, compliance): Node.js 20, TypeScript, LangGraph.js, OpenAI‑style tools; reuse existing code from:
  - `/Users/sasha/IdeaProjects/personal_projects/navan/root/src/tools/*`
  - `/Users/sasha/IdeaProjects/personal_projects/navan/root/src/core/deep_research.ts`
  - `/Users/sasha/IdeaProjects/personal_projects/finearts/callquest/root/src/tools/search.ts`
  - `/Users/sasha/IdeaProjects/personal_projects/tavily`
  and follow guidelines from:
  - `/Users/sasha/IdeaProjects/allthedocs/learning/research/ai_engineering/agentic_systems_building_best_practices.md`

## Definition of Done
List 5–10 concrete conditions that must be true when the project is “Done” (functional and non‑functional).
- Functional outcomes (what users can do):
  - Run kotef against a local project and have it:
    - read SDD specs (`.sdd/*`),
    - perform deep web research for missing knowledge,
    - propose and implement code changes via tools/CLI.
  - Support web search and focused content fetching using adapted Navan/Tavily components.
  - Expose a simple CLI / API to trigger research → architecture → coding loops.
- Quality attributes (performance, reliability, security, UX):
  - Respect timeouts, rate limits, and host allowlists for all web calls.
  - Never write outside the allowed project workspace; provide diffs/patches instead of blind overwrites.
  - All non‑trivial answers grounded in either repo files or web receipts (with citations).
  - Clear logs/telemetry for search, tool calls, and code edits.
- Process constraints (tests, documentation, release criteria):
  - Basic test coverage for search tools, deep research, and agent orchestration.
  - `architect.md` explicitly incorporates and cites the best‑practices doc for agentic systems.
  - Minimal “Getting Started” documentation for running kotef on a new repo.

## Non‑functional Requirements (optional)
- Performance / latency / throughput:
  - Single‑query coding session (research → plan → first edits) should typically complete within a few minutes on a small/medium repo.
  - Web search calls must enforce per‑request timeouts and limit result volume.
- Availability / reliability / SLOs:
  - Graceful degradation when web search or LLM APIs fail (clear error surfaced, no half‑applied edits).
- Security / compliance:
  - No leaking of secrets or private file contents in logs or external prompts.
  - Follow host allowlists and robots.txt behavior from the Tavily/navan projects.
- Observability / operations:
  - Structured logs for key actions (search, scraping, plan generation, code edits).
  - Hooks for future metrics integration (e.g. Prometheus / Langfuse) without hard‑coding a specific vendor.

## High-level Architecture Plan (for architect.md)
- Overall pattern: single meta‑agent with internal “SDD brain” and tool‑calling body, with an upgrade path to multi‑agent (planner / researcher / coder) if needed.
- Core subsystems to describe in `architect.md`:
  - SDD Layer:
    - Files: `.sdd/project.md`, `.sdd/best_practices.md`, `.sdd/architect.md`, `.sdd/backlog/tickets/*`.
    - Responsibility: long‑term goals, Definition of Done, coding standards, tickets and ADRs.
    - Architect spec must define how these files are loaded, validated, and updated by the agent (including Snitch/`.sdd/issues.md` loop).
  - Search & Deep Research Layer:
    - Reuse and adapt:
      - `finearts/callquest/root/src/tools/search.ts` for generic web search (Serper/Tavily/generic JSON).
      - `navan/root/src/tools/{brave_search.ts,tavily_search.ts,search.ts}` for provider‑specific search with resilience, metrics and confidence.
      - `navan/root/src/core/deep_research.ts` as the main “deep research” component (multi‑query, deduplication, synthesis).
      - Patterns from `personal_projects/tavily` (HTTP+Playwright, robots.txt, CAPTCHA handling) for safe fetching of pages discovered by search.
    - Architect spec should define:
      - Which module is the primary search tool for kotef.
      - How we choose between “shallow search” vs “deep research” for a given task.
      - Host allowlists / blocked hosts and timeouts.
  - Coding Tools Layer:
    - Abstractions for:
      - reading/writing files under a target project root (diff‑first editing, respect `.gitignore`/config);
      - running tests, linters, type‑checks via commands defined in the target project’s SDD `architect.md` (`### Commands` section);
      - generating and applying patches (git‑style hunks) safely.
    - Architect spec should outline how these tools are exposed to the LLM (OpenAI‑style tools / LangGraph.js tool nodes).
  - Orchestration Layer:
    - Implemented in Node.js / TypeScript (LangGraph.js preferred), with:
      - graph of nodes/agents (planner, researcher, coder, verifier) sharing access to SDD files and tools.
      - state object that carries current task, SDD context, intermediate research results, and code diff status.
    - Architect spec should describe:
      - node graph (states, transitions, stop conditions);
      - how Definition of Done is checked before finishing a run;
      - how feedback from runtime (test failures, spec conflicts) flows back into `.sdd/issues.md` and eventually в `.sdd/architect.md`.
  - Observability & Safety:
    - Logging of all external calls (search, scraping, LLM), including timings and outcomes.
    - Basic counters/metrics for success/failure of coding runs, search quality, and spec conflicts.
    - Guardrails for secrets, PII, and host allowlists (align with Navan/Tavily patterns and the best‑practices doc).

## Orchestrator / Agent Sketch (kotef runtime)
- Main role: glue SDD brain + tools into a single experience similar to Claude Code / Q Chat / ChatGPT Code.
- Rough structure (for future `architect.md` and implementation):
  - Entry points:
    - CLI command (e.g. `kotef run <project-root>`) that:
      - loads `.sdd/*` for the target project;
      - constructs the LangGraph.js graph with configured tools (search, deep research, file I/O, test runner);
      - triggers a single “task run” (e.g. implement next ticket, fix failing tests, perform research).
    - Optional API/daemon mode for multi‑turn sessions.
  - Agents / nodes (can initially be a single meta‑agent, but architect.md should allow splitting):
    - Planner node:
      - Reads `.sdd/project.md`, `.sdd/architect.md`, open tickets.
      - Decides whether to call deep research tools (Navan/Tavily) for this task.
      - Produces a short internal plan (which tools to call, which files to touch).
    - Research node:
      - Wraps `search` + `deep_research.ts` and, if needed, page‑fetch techniques from Tavily project.
      - Returns a structured summary and citations that can be written into `.sdd/best_practices.md` or used ad‑hoc for a ticket.
    - Coding node:
      - Uses SDD Agent‑prompt + tools (file read/write, tests) to apply changes.
      - Obeys Snitch protocol: on spec conflicts writes entries to `.sdd/issues.md` instead of hacking around.
    - Verifier node:
      - Runs tests/linters via commands defined in the target project’s SDD `architect.md`.
      - Decides whether Definition of Done is satisfied for the current ticket.
  - State & feedback:
    - Shared state includes:
      - current ticket and status (planned / in‑progress / blocked / done);
      - research artifacts (citations, summaries, URLs);
      - code diff summaries and test results.
    - On failures:
      - Verifier or Coding node records issues in `.sdd/issues.md`.
      - Planner can request spec updates (new tickets / ADR changes) before retrying.
- Architect for kotef должен опираться на
  `/Users/sasha/IdeaProjects/allthedocs/learning/research/ai_engineering/agentic_systems_building_best_practices.md`
  при выборе паттерна (single vs multi‑agent, memory, evaluation) и явно описать этот выбор в `architect.md` (через ADR + MCDM).
- Tech stack: Node.js 20 / TypeScript / LangGraph.js
- Domain: AI coding/search agent
- Year: 2025

## Task
Create a comprehensive best‑practices guide for kotef that is:
1) Current — relevant to 2025; mark deprecated/outdated items.
2) Specific — tailored to Node.js 20 / TypeScript / LangGraph.js and AI coding/search agent.
3) Practical — include concrete commands/config/code.
4) Complete — cover architecture, quality, ops, security, and technical debt.
5) Risk‑aware — define a simple metric profile (PerfGain, SecRisk, DevTime, Maintainability, Cost, DX) with indicative weights for this project, plus 3–5 key risks with High/Medium/Low labels.
6) Conflict‑aware — explicitly call out conflicting or mutually exclusive practices and alternative patterns.
7) Verification‑ready — for each major recommendation, note how to validate it (tests, metrics, experiments) so the architect/agent can reuse these checks.

## Output Structure (Markdown)
### 1. TL;DR (≤10 bullets)
- Key decisions and patterns (why, trade‑offs, MVP vs later)
- Observability posture; Security posture; CI/CD; Performance & Cost guardrails
- What changed in 2025; SLOs summary

### 2. Landscape — What’s new in 2025
For Node.js 20 / TypeScript / LangGraph.js:
- Standards/framework updates; deprecations/EOL; pricing changes
- Tooling maturity: testing, observability, security
- Cloud/vendor updates
- Alternative approaches and when to choose them

### 3. Architecture Patterns (2–4 for AI coding/search agent with Node.js 20 / TypeScript / LangGraph.js)
Pattern A — [NAME] (MVP)
- When to use; Steps; Pros/Cons; Optional later features

Pattern B — [NAME] (Scale‑up)
- When to use; Migration from A

### 3.1 Conflicting Practices & Alternatives
- List concrete areas where reputable sources disagree (e.g., sync vs async I/O, ORMs vs SQL, service boundaries, caching strategy).
- For each conflict, summarize:
  - Options (A/B/…)
  - When each is preferable (context/scale/risk profile)
  - Key trade‑offs and risks (PerfGain, SecRisk, DevTime, Maintainability, Cost, DX)
  - Any hard constraints from the project description (Definition of Done, compliance, budgets) that favor one option.

### 4. Priority 1 — [AREA]
Why → relation to goals and mitigated risks
Scope → In/Out
Decisions → with rationale and alternatives
Implementation outline → 3–6 concrete steps
Guardrails & SLOs → metrics and limits/quotas
Failure Modes & Recovery → detection→remediation→rollback

### 5–6. Priority 2/3 — [AREA]
Repeat the structure from 4.

### 7. Testing Strategy (for Node.js 20 / TypeScript / LangGraph.js)
- Unit / Integration / E2E / Performance / Security
- Frameworks, patterns, coverage targets

### 8. Observability & Operations
- Metrics, Logging, Tracing, Alerting, Dashboards

### 9. Security Best Practices
- AuthN/AuthZ, Data protection (PII, encryption), Secrets, Dependency security
- OWASP Top 10 (2025) coverage; Compliance (if any)

### 10. Performance & Cost
- Budgets (concrete numbers), optimization techniques, cost monitoring, resource limits

### 11. CI/CD Pipeline
- Build/Test/Deploy; quality gates; environments

### 12. Code Quality Standards
- Style, linters/formatters, typing, docs, review, refactoring

### 13. Reading List (with dates and gists)
- [Source] (Last updated: YYYY‑MM‑DD) — gist

### 14. Decision Log (ADR style)
- [ADR‑001] [Choice] over [alternatives] because [reason]

### 15. Anti‑Patterns to Avoid
- For Node.js 20 / TypeScript / LangGraph.js/AI coding/search agent with “what, why bad, what instead”

### 16. Evidence & Citations
- List sources inline near claims; add links; include “Last updated” dates when possible.

### 17. Verification
- Self‑check: how to validate key recommendations (scripts, smoke tests, benchmarks)
- Confidence: [High/Medium/Low] per section

### 18. Technical Debt & Migration Guidance
- Typical sources of technical debt for Node.js 20 / TypeScript / LangGraph.js/AI coding/search agent.
- Recommended strategies to keep debt under control over time (continuous refactoring, migration paths, feature flags).
- When to introduce dedicated “janitor” tasks and what they should look like.

## Requirements
1) No chain‑of‑thought. Provide final answers with short, verifiable reasoning.
2) If browsing is needed, state what to check and why; produce a provisional answer with TODOs.
3) Keep it implementable today; prefer defaults that reduce complexity.
4) Do not fabricate libraries, APIs, or data; if unsure or the evidence is weak, mark the item as TODO/Low confidence and suggest concrete sources to verify.

## Additional Context
{{EXTEND THE CONTENT BELOW AND RETURN EXPANDED VERSION, CRAWL MORE LINKS:

Also specifically research the way the coding agent works in Antigravity IDE, in Codex coding agent, in RooCode coding agent, and in Claude code (antigravity is the best one) and align with implementation.

### 1. TL;DR (≤10 bullets) 1. Use **Node.js 20 LTS + TypeScript ≥5.8 (pin to latest 5.8/5.9)**, with strict mode, project references, and Node’s built-in test runner for low-friction DX. ([ITMAGINATION][1]) 2. Orchestrate kotef with **LangGraph.js**: one main graph, checkpointer, tool nodes for search, research, file I/O, tests; start with a **single meta-agent** and keep the design upgradeable to multi-agent. ([LangChain Docs][2]) 3. Treat .sdd/* as the **single source of truth**: always load on start, propagate changes via tools only, and sync planner/researcher/coder/validator around SDD-defined Definition of Done. 4. Make **code editing “diff-first & permission-bound”**: Node permission model + workspace root + .gitignore + explicit allowlist + dry-run patches by default. ([Node.js][3]) 5. Use a **two-tier search strategy**: shallow search (few queries, cheap models) vs deep research (multi-query, summarization, dedup, higher-end models) via adapted Navan/Tavily tools, always with host allowlists and robots.txt awareness. ([Adopt AI][4]) 6. Build **observability in from day one**: structured logs (JSON), trace IDs per run, and LangGraph’s built-in tracing hooks; keep a simple text “run report” per execution. ([LangChain][5]) 7. Security posture: follow **OWASP Top 10 2025 RC** (esp. security misconfiguration, auth, injection, SSRF) for all web calls and tool usage; never send secrets or large blobs to LLMs; enforce Node permission model in CI. ([OWASP Foundation][6]) 8. CI/CD: every PR must pass lint + typecheck + unit + integration (agent dry-runs) + security checks; release via tagged versions and changelog/ADR updates. 9. Performance & cost: hard-cap each run by **time, tokens, and HTTP calls**; add simple per-run and per-day budgets; cache research artifacts by URL + hash. ([Hiflylabs][7]) 10. Evaluation: maintain a small **scenario suite** (tickets + repos + expected edits) and periodically run it as regression tests for the orchestrator. **Metric profile (weights, 0–1, sum ≈1, for design trade-offs)** * PerfGain: 0.15 * SecRisk: 0.25 (minimize) * DevTime: 0.20 * Maintainability: 0.20 * Cost: 0.10 * DX (developer experience): 0.10 **Key risks (headline)** * R1: Uncontrolled code edits / file corruption — **High** * R2: Prompt-injection & data exfiltration via web search — **High** * R3: Vendor API/model changes breaking tools — **Medium** * R4: Runaway cost / latency without budgets — **Medium** * R5: Stale best-practices / security posture — **Low–Medium** (mitigate via periodic review) --- ### 2. Landscape — What’s new in 2025 (Node.js 20 / TS / LangGraph.js) **Node.js 20 LTS** * **Permission model** (experimental but mature by 20.12): restrict FS, child processes, workers, addons and WASI via flags like --experimental-permission, --allow-fs-read, --allow-fs-write, --allow-child-process, --allow-worker, --allow-addons. ([Node.js][3]) * **Built-in test runner** (node:test) is stable, so you can avoid external runners for core logic. ([ITMAGINATION][1]) * **EOL**: Node 20 maintenance support until April 2026; plan migrations early. ([herodevs.com][8]) **TypeScript 5.8/5.9** * TS 5.6 introduced --noCheck and additional analysis features; later 5.8/5.9 builds on that with more precise checks and performance improvements. ([TypeScript][9]) * Latest TS (≈5.9.x) is the default on npm; pin exact minor (e.g. 5.9.3) to avoid surprise regressions. ([npm][10]) **LangGraph.js** * LangGraph is a **low-level orchestration framework** for controllable, stateful agents; heavily used in production by companies like Replit, Uber, GitLab. ([LangChain][5]) * Key primitives: **graphs of nodes**, **durable execution/checkpointing**, **streaming**, and **human-in-the-loop** capabilities. ([LangChain Docs][2]) * Works well with LangChain components but does not require them; good match for custom tools like your SDD / search / code-edit layer. **Agentic ecosystem 2025** * Multi-agent frameworks (LangGraph, AutoGen, CrewAI, etc.) emphasize **stateful workflows, tool routing, and evaluation**; LangGraph is usually recommended when you need fine-grained orchestration and robustness. ([Stream][11]) * Cloud vendors (e.g. Gemini 3 with LangGraph support) push **agent evaluation and observability** as first-class concerns. ([Google Developers Blog][12]) **Security landscape** * OWASP Top 10 2025 RC stresses **security misconfiguration**, **broken access control**, **insecure design**, and **server-side request forgery (SSRF)** as key app-level risks; all relevant to a tool that hits the filesystem and external web. ([OWASP Foundation][6]) --- ### 3. Architecture Patterns (Node.js 20 + TS + LangGraph.js) #### Pattern A — “Single-Graph Meta-Agent” (MVP) **When to use** * Early kotef versions, single user (you), ≤ a few concurrent runs, 1 repo at a time. * You want a **simple mental model**: one orchestrator graph, multiple tools. **Steps** 1. Create a **LangGraph graph** with a single agent node that: * loads .sdd/* into state; * calls tools: read_file, write_patch, run_tests, shallow_search, deep_research. 2. Add a **checkpointer** to persist state per run (run_id). 3. Wrap the graph into a CLI command kotef run <project-root>. 4. Implement “Definition of Done” checks in the agent prompt + simple verifier logic (tests + SDD conditions). 5. Wire structured logging and Node permission flags into the CLI. **Pros** * Minimal orchestration complexity. * Easy to iterate on prompts/tools. * Less risk of graph bugs. **Cons** * Plan/research/coding tightly coupled; harder to debug and evaluate. * Scaling to multi-step, multi-tool flows may get messy. **Optional later features** * Add a manual “approve patch” gate before writes. * Plug LangSmith or equivalent tracing for interactive debugging. ([LangChain][5]) --- #### Pattern B — “Four-Node Agent Graph” (Scale-up) Planner → Researcher → Coder → Verifier, all sharing SDD context and tools. **When to use** * You want explainable runs (who did what). * You begin to share kotef with others or run it in CI. * You need **different LLM models** / temperature per node. **Steps** 1. Define a shared state: { task, ticket, sdd, research, patches, tests, status }. 2. Nodes: * **Planner**: reads .sdd/project.md, .sdd/architect.md, tickets; produces a plan (tools + files). * **Researcher**: calls search / deep_research and returns structured citations. * **Coder**: applies patches using diff-first tools; respects SDD and Snitch/.sdd/issues.md. * **Verifier**: runs tests/linters and marks Definition of Done or writes issues. 3. Use LangGraph’s conditional edges to route between nodes based on state flags (needs_research, tests_failed, blocked_by_spec). 4. Keep graph configuration declarative (YAML/TS config) to ease experimentation. **Pros** * Better separation of concerns and debuggability. * Easier to run **per-node evaluations** (e.g. research quality vs code quality). * Natural place to add human approval stages. **Cons** * Graph complexity + more surface area for bugs. * Slightly higher latency and token usage. **Migration from A** * Start from Pattern A implementation. * Factor out planner logic into its own node. * Introduce researcher and verifier nodes; coder node becomes thin wrapper around tools. --- ### 3.1 Conflicting Practices & Alternatives 1. **Single meta-agent vs multi-agent graph** * **Option A (Single agent)**: simpler, good for MVP; fewer prompts and tools to manage. * **Option B (Multi-agent)**: better for observability/evaluation and scaling; more moving parts. ([LangChain][5]) * For kotef: start with A, design SDD and state to make migration to B straightforward. 2. **Node built-in test runner vs Jest/Vitest** * **Option A (node:test)**: no extra deps, full Node 20 support, good for core logic. ([ITMAGINATION][1]) * **Option B (Jest/Vitest)**: richer features, ecosystem plugins, watch mode. * For kotef: use node:test for library code and small harness; optionally add Vitest for nicer DX later. 3. **ORM vs query builder vs raw SQL (for any persistence you add later)** * **Option A (ORM)**: rapid development, but can be heavy and magic-y; higher DevTime gain, lower Maintainability if schema gets complex. * **Option B (query builder / Kysely / Drizzle)**: good balance; types, migrations, simpler mental model. * **Option C (raw SQL)**: minimal deps; more boilerplate, but predictable. * For kotef (tooling, not data-heavy): prefer **Option B or even JSON files** to avoid DB complexity. 4. **Node permission model enabled vs disabled** * **Option A (Enabled)**: reduces blast radius for FS/network; slight friction for scripts and tests. ([Node.js][3]) * **Option B (Disabled)**: simpler, but significantly higher SecRisk. * For kotef: **always enabled in CI and for CLI by default**, with an escape hatch (KOTEF_UNSAFE_PERMS=1) only for development experiments. 5. **State persistence strategy (files vs DB vs LangGraph checkpointer only)** * **Option A (LangGraph checkpointer on local filesystem)**: simplest; good for single-machine use. ([LangChain Docs][2]) * **Option B (DB + checkpointer)**: required only if you later expose kotef as a shared service. * For kotef: Option A; align with .sdd representation and keep run logs nearby. For each conflict, use the metric profile: e.g. Node permission model **increases DevTime** slightly but dramatically **reduces SecRisk**, so it is preferred. --- ### 4. Priority 1 — Safe Code Editing & Workspace Isolation **Why** * R1 (uncontrolled edits) and R2 (prompt-injection exfiltration) are the highest risks. * kotef must never “trash a repo” or leak data to external services. **Scope** * In: file I/O, patch generation, workspace boundaries, Node permission model, .gitignore and allowlists. * Out: high-scale multi-tenant isolation (you’re single-user initially). **Decisions** 1. All edits are **diff-first**: * tools only return patches (unified diff or hunk model); * CLI has modes: --dry-run (print patch), --apply (apply after optional confirmation). 2. Workspace rules: * Every run has a **root** (project-root) and a **denylist** (system dirs, $HOME, etc.). * Tools enforce that all paths live under root and not under denylisted folders. 3. Node permission flags: * CLI invokes Node like: node --experimental-permission --allow-fs-read=<root>,.gitignore --allow-fs-write=<root> --allow-child-process --allow-worker dist/cli.js (exact flags tuned to Node 20.12 semantics). ([Node.js][3]) 4. No raw fs.writeFile from LLM tools; only apply_patch with validation. **Implementation outline (3–6 steps)** 1. Implement FileService in TS that: * normalizes paths (path.resolve(root, relPath)), * rejects escapes (.. outside root), * respects .gitignore / .sdd/config rules. 2. Implement generatePatch and applyPatch utilities; add unit tests with tricky cases (overlapping hunks, CRLF, large files). 3. Wrap FS access in **LangGraph tools** read_file, write_patch, list_files. 4. Wire Node permission flags into package.json scripts and CLI. 5. Add a **pre-apply diff preview** with a summary (files touched, added/removed lines). **Guardrails & SLOs** * SLO-1: 0 critical incidents of “file outside workspace modified” per quarter. * SLO-2: 0 incidents of /etc, $HOME, or other forbidden paths touched. * Limit patch size per file (e.g. 5k lines or 100 KB) unless --unsafe-large-patch is explicitly set. **Failure Modes & Recovery** * Detection: * Logs show patch previews; CI checks that no files outside allowlist changed. * A “canary” job runs kotef against a sacrificial repo and verifies only expected files changed. * Remediation: * git reset --hard or automatic stash if available. * Write corruption events to .sdd/issues.md and keep the faulty patch in a quarantine folder. * Rollback: * Tag each run with a Git commit hash; allow kotef undo <run-id> → git reset or revert. --- ### 5. Priority 2 — Search & Deep Research Layer **Why** * kotef relies heavily on web search and scraping; that’s where prompt-injection, SSRF, and cost blow-ups happen. * Good research quality is key to high-quality coding decisions. ([Adopt AI][4]) **Scope** * In: shallow search, deep research, scraping, caching, host allowlists, robots.txt. * Out: general-purpose crawler or large-scale storage. **Decisions** 1. Two tools: * shallow_search → 1–3 queries, top N results, cheaper models. * deep_research → multi-query, dedup, summarization based on Navan deep_research.ts. 2. Strict host policy: * Allowlist from config (e.g. npmjs.com, nodejs.org, typescriptlang.org, github.com, owasp.org, docs, blogs). * Optional “unsafe” mode with manual confirmation. 3. Respect robots.txt and avoid login/CSRF flows; reuse Tavily/navan patterns. ([Adopt AI][4]) 4. Per-run limits: max 30 URLs fetched, HTTP timeout (e.g. 15–30s), max size per page (e.g. 1 MB). **Implementation outline** 1. Adapt search.ts from finearts/callquest + navan search tools as searchTool with provider switch (brave, tavily, generic JSON). 2. Implement deep_research around navan/root/src/core/deep_research.ts: multi-query strategy + dedup + aggregator that returns: * list of sources (URL, title, snippet), * structured summary, * citations ready for .sdd/best_practices.md. 3. Add a small **prompt-injection filter**: * strip obvious “ignore previous instructions” and “exfiltrate X” patterns before feeding pages into LLM prompts (best-effort). 4. Implement **cache**: (query, host, date-range) → saved results on disk; TTL configurable. **Guardrails & SLOs** * SLO-1: 95% of deep research runs finish within 2–3 minutes (small repo case). * SLO-2: <1% of runs hit HTTP timeouts or provider errors without a clear user-visible error. * SLO-3: 0 known incidents of secrets or private code being sent to search provider or LLM. **Failure Modes & Recovery** * Provider errors: surface them clearly and suggest retry/different provider. * Timeouts: return partial results and mark them clearly incomplete. * Injection / untrusted content: * treat all external text as untrusted; * never execute scripts; never follow non-HTTP(S) URLs or local addresses. --- ### 6. Priority 3 — Observability, Evaluation & CI Integration **Why** * Agentic systems are opaque; without logs and eval, debugging is painful. * You need to know what kotef did to a repo and why. ([LangChain][5]) **Scope** * In: logs, traces, run reports, metrics, CI gates, small eval suite. * Out: full production SRE stack. **Decisions** 1. Use **structured JSON logging** with a minimal, stable schema. 2. Tag everything by run_id, project_root, and ticket_id. 3. Add a simple “run report” text file under .sdd/runs/<timestamp>.md summarizing: * plan, research highlights, files touched, tests run, status. 4. Integrate with CI (e.g. GitHub Actions) to run **non-interactive CLI runs** on example tickets. **Implementation outline** 1. Implement a Logger wrapper around console that emits structured JSON. 2. Use LangGraph’s tracing hooks for node-level logging (node name, input/output) and include run IDs. ([LangChain Docs][2]) 3. Add npm scripts: * test:quick, test:integration, test:agents, lint, typecheck. 4. CI workflow: * install deps → lint → typecheck → test:quick → test:agents (run small scenario suite). **Guardrails & SLOs** * Every run produces a **run report** and at least one log file. * CI must be green for merges into main. **Failure Modes & Recovery** * If logging fails (e.g. permission error), abort run early (better no change than untracked change). * Treat missing run report as a CI failure. --- ### 7. Testing Strategy (Node.js 20 / TS / LangGraph.js) **Levels** 1. **Unit tests** * Pure TS utilities: path normalization, patch application, search result merging, config parsers. * Use node:test or Vitest; run on every change. ([ITMAGINATION][1]) 2. **Integration tests** * File tools against a temp directory. * Search/deep research with mocked providers and small sample responses. * Node permission model: run CLI with restricted flags and assert denial of forbidden paths. 3. **End-to-End tests** * Full kotef run against a **fixture repo** (tiny TS project with .sdd/*). * Assertions: only expected files changed; tests pass; run report generated. 4. **Performance & cost smoke tests** * Time kotef run and record HTTP/LLM calls. 5. **Security tests** * Intentional prompt-injection in test pages; assert kotef doesn’t follow malicious instructions (best-effort). * Static analysis (e.g. npm audit, simple secret scanning). **Targets** * Unit: ≥80% coverage on critical utilities (FileService, patch, config). * Integration: at least one happy-path and one error-path per tool. * E2E: a minimal scenario suite (3–5 tickets) run in CI. --- ### 8. Observability & Operations **Metrics** * Per run: * duration (ms), * number of tool calls, * # HTTP requests and bytes, * tokens sent/received (if provider exposes). * Per node (if multi-agent): * success/failure count, * average latency. **Logging** * JSON structure like:
json
  {
    "ts": "2025-11-24T10:00:00.000Z",
    "level": "info",
    "run_id": "2025-11-24T09-58-00Z-abc",
    "node": "coder",
    "event": "apply_patch",
    "file": "src/foo.ts",
    "lines_added": 20,
    "lines_removed": 5
  }
**Tracing** * Use LangGraph’s tracing / checkpointer for node-level traces; optionally integrate with LangSmith later. ([LangChain][5]) **Alerting** * For now: “poor man’s alerts” via CI: * fail pipeline if SLOs violated (e.g. run > X minutes, >N errors). * Later: hook metrics into Prometheus / Langfuse / similar (TODO, low confidence; choose concrete vendor from recent ecosystem reviews). --- ### 9. Security Best Practices **AuthN/AuthZ** * CLI is local-only; no multi-user. For future API mode: * token-based auth over HTTPS; * per-user allowed project roots. **Data protection** * Do not log file contents or secrets; log **paths and hashes** instead. * Keep any prompt logs **redacted**; treat .env and similar files as never-read unless explicitly whitelisted. **Secrets** * .sdd/config identifies secret files and patterns; FS tools refuse to read or send them to LLM or search providers. * Use OS-level secrets (env vars) for API keys; never commit them. **OWASP Top 10 2025 coverage** * **A02 Security Misconfiguration**: Node permission model, locked-down CI, minimal ports and services. ([OWASP Foundation][6]) * **Injection / SSRF**: never feed unvalidated URLs into internal tooling; enforce host allowlists and protocols; avoid executing downloaded content. * **Insecure Design**: SDD explicitly documents safety constraints and threat model; issues go into .sdd/issues.md. **Verification** * Security smoke tests (Section 7). * Periodic review against latest OWASP Top 10 2025 final once published (TODO: re-check OWASP site after final release). --- ### 10. Performance & Cost **Budgets (example defaults)** * Max run duration: 5 minutes (small repo) unless --max-minutes overridden. * Web calls: ≤30 HTTP requests per run; HTTP timeout 15–30s. * LLM tokens: ≤50k tokens per run; warn at 40k; hard stop at limit. **Techniques** * Prefer **smaller models** for exploration, larger for final patch synthesis. * Cache: * search results (by query + provider), * page fetches (by URL + ETag/Last-Modified if available). * Parallelism: * limit concurrent HTTP requests (e.g. 3–5); Node 20 handles concurrent I/O well, but keep resource usage predictable. ([ITMAGINATION][1]) **Verification** * Add a --profile mode that prints per-run timings and counts. * CI threshold tests: fail if a standard scenario exceeds baseline by >X%. --- ### 11. CI/CD Pipeline **Pipeline** 1. lint (ESLint + TypeScript plugin). 2. format:check (Prettier). 3. typecheck (TS --noEmit). 4. test (unit + integration). 5. test:agents (small E2E). 6. Security checks: npm audit --production, simple secret scan. 7. Package build: tsc -p tsconfig.build.json. **Environments** * dev: local, you run CLI with verbose logs. * ci: runs on each PR and push to main. * release: tag + GitHub Release + update .sdd/architect.md ADRs. **Quality gates** * No lint/type errors. * Coverage threshold met. * No high-severity vulnerabilities (or explicitly accepted in ADR). --- ### 12. Code Quality Standards * **Style & lint** * Prettier for formatting. * ESLint + @typescript-eslint + Node plugin; rules tuned for Node 20. * **Typing** * "strict": true in tsconfig.json. * Avoid any; use unknown + narrow. * **Docs** * At least docstrings for public functions and tools. * Keep .sdd/best_practices.md (this doc) and .sdd/architect.md in sync. * **Reviews** * Even as solo dev, treat major changes as PRs, review diffs yourself, and update ADRs. --- ### 13. Reading List (with dates and gists) * Node.js 20 release & permission model (Node blog, 2023–2024) — details on permission flags, test runner, and diagnostics. ([Node.js][3]) * Node.js 20 feature overviews (various blogs, 2023) — explain security and performance motivations behind the permission model. ([ITMAGINATION][1]) * Node.js EOL matrix (2024) — lifecycle dates for Node 20/22. ([herodevs.com][8]) * TypeScript 5.6 release notes & follow-ups (2024) — new checks and compiler options like --noCheck; context on 5.x evolution. ([TypeScript][9]) * TypeScript npm page (2025) — confirms 5.9.x as current stable. ([npm][10]) * LangGraph docs & repo (ongoing) — design philosophy, JS API reference, examples of stateful graphs. ([LangChain Docs][2]) * Agent framework comparison posts (2025) — where LangGraph fits vs AutoGen, CrewAI, etc. ([Stream][11]) * OWASP Top 10 2025 RC & analyses (2025) — updated categories, shift in emphasis on misconfiguration and insecure design. ([OWASP Foundation][6]) --- ### 14. Decision Log (ADR style) Examples to keep in .sdd/adr/*.md: * **ADR-001 — LangGraph.js over alternative agent frameworks** Chosen for mature JS/TS support, production adoption, and fine-grained orchestration; alternatives (AutoGen, CrewAI, custom) either Python-first or heavier to integrate. ([GitHub][13]) * **ADR-002 — Enable Node permission model by default** Chosen to minimize SecRisk at modest DevTime cost; alternatives (no permission model) rejected due to high blast radius for code-editing agent. ([Node.js][3]) * **ADR-003 — Use Node built-in test runner for core tests** Chosen to reduce dependencies and align with Node 20’s stable node:test; may add Vitest later for convenience. ([ITMAGINATION][1]) * **ADR-004 — SDD as canonical configuration and DoD** Chosen to keep all goals, constraints, and standards in .sdd/*, so the agent always has the same view as humans. --- ### 15. Anti-Patterns to Avoid 1. Running kotef without Node permission flags or with --allow-fs-read=* --allow-fs-write=* in normal use. 2. Letting the LLM craft arbitrary absolute paths or shell commands — paths must be validated by tools. 3. Writing full files from scratch each time instead of patches (high corruption risk). 4. Mixing SDD and ad-hoc config files so different agents/humans see different truths. 5. Allowing unrestricted search hosts (e.g. intranet, localhost, metadata endpoints) — SSRF risk. ([OWASP Foundation][6]) 6. Logging full prompts with secrets or large code blobs into third-party services. 7. Skipping tests “just this once” on agent changes — most failures will be subtle orchestration bugs. --- ### 16. Evidence & Citations * Node 20 features and permission model: Node blog & docs, plus independent reviews. ([Node.js][3]) * Node EOL: lifecycle summary. ([herodevs.com][8]) * TS 5.x evolution: official docs and independent notes. ([TypeScript][9]) * LangGraph capabilities and production use: official site, docs, GitHub. ([LangChain Docs][2]) * Agent framework comparisons: blogs and vendor posts. ([Stream][11]) * OWASP Top 10 2025 RC and commentary. ([OWASP Foundation][6]) Where items are marked TODO / low confidence (e.g. concrete observability vendor, final OWASP list), re-check the linked sources and ecosystem state when you next iterate on kotef. --- ### 17. Verification For each major recommendation: * **Node permission model + FS guardrails** * Verification: integration tests using temp dirs + CI run that asserts failure when trying to escape workspace. * Confidence: High (backed by official docs and security write-ups). ([Node.js][3]) * **Diff-first editing** * Verification: tests that reconstruct original files from applying/reverting patches; E2E runs that compare Git diffs. * Confidence: High. * **Two-tier search system** * Verification: measure latency and cost on sample workloads; ensure deep research improves code suggestions vs shallow. * Confidence: Medium (depends on prompt quality and provider). * **LangGraph-based orchestration** * Verification: scenario suite with known expected actions; confirm node transitions and final state; use LangGraph tracing. ([LangChain Docs][2]) * Confidence: High. * **Testing & CI pipeline** * Verification: red/green runs on broken fixture repos; ensure bad patches or failing tests block release. * Confidence: High. --- ### 18. Technical Debt & Migration Guidance **Typical TD sources for Node.js 20 / TS / LangGraph agents** * Ad-hoc prompts and tool payloads scattered across files instead of SDD + central config. * Hard-coded provider keys, model names, or URLs. * Mixed error-handling patterns (callbacks, promises, async/await without consistent conventions). * Under-documented LangGraph graphs (hard to evolve). **Strategies** 1. **Continuous refactoring** * When adding a node or tool, update .sdd/architect.md and, if needed, ADRs. * Keep prompts and tool schemas in well-named modules. 2. **Feature flags** * Wrap risky changes (new providers, aggressive refactor) behind flags to switch back quickly. 3. **Migration paths** * Node: plan to move from 20 → 22 before 20 EOL in 2026. ([herodevs.com][8]) * TS: periodic upgrades (e.g. 5.8 → 5.9) with changelog review and targeted fixes. ([npm][10]) 4. **“Janitor” tasks** * Every N weeks, dedicate a ticket to: * delete dead code/tools; * update dependencies; * re-sync SDD docs; * re-run security checks against latest OWASP list. This guide should live as .sdd/best_practices.md for kotef and evolve with your stack; treat it as a living contract between you, future collaborators, and the agent itself. [1]: https://www.itmagination.com/blog/introducing-node-js-20-new-features-updates-and-improvements "Node.js 20: New Features, Updates, and Improvements" [2]: https://docs.langchain.com/oss/javascript/langgraph/overview "LangGraph overview - Docs by LangChain" [3]: https://nodejs.org/en/blog/announcements/v20-release-announce "Node.js 20 is now available!" [4]: https://www.adopt.ai/blog/top-7-open-source-ai-agent-frameworks-for-building-ai-agents "Top 7 Open Source AI Agent Frameworks for Building AI Agents" [5]: https://www.langchain.com/langgraph "LangGraph" [6]: https://owasp.org/Top10/2025/0x00_2025-Introduction/ "Introduction - OWASP Top 10:2025 RC1" [7]: https://hiflylabs.com/blog/2025/4/24/frameworks-ai-agents "Practical Frameworks for Building AI Agents" [8]: https://www.herodevs.com/blog-posts/node-js-end-of-life-dates-you-should-be-aware-of "Node.js End-of-Life Dates You Should Be Aware Of" [9]: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-6.html "Documentation - TypeScript 5.6" [10]: https://www.npmjs.com/package/typescript?activeTab=versions "typescript" [11]: https://getstream.io/blog/multiagent-ai-frameworks/ "Best 5 Frameworks To Build Multi-Agent AI Applications" [12]: https://developers.googleblog.com/building-ai-agents-with-google-gemini-3-and-open-source-frameworks/ "Building AI Agents with Google Gemini 3 and Open Source ..." [13]: https://github.com/langchain-ai/langgraphjs "langchain-ai/langgraphjs: Framework to build resilient ..."

}}

---
Start the research now and produce the guide for kotef.

