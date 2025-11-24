# Project Description

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
    - accept a natural‑language goal (e.g. “add pagination to blog posts”),
    - if needed, perform best‑practice research and **bootstrap SDD** for that repo (create or update `.sdd/project.md`, `.sdd/best_practices.md`, `.sdd/architect.md`, and initial tickets),
    - read and respect SDD specs (`.sdd/*`),
    - perform deep web research for missing knowledge,
    - propose and implement code changes via tools/CLI.
  - Support web search and focused content fetching using adapted Navan/Tavily components.
  - Expose a simple CLI / API to trigger research → architecture → coding loops (including an “auto‑SDD” mode for repos without `.sdd/`).
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

---

## SDD Framework Readiness as Coding‑Agent Core

**What is fully ready**
- SDD flow and artifacts:
  - `brain/` contains the SDD toolkit (prompts + scripts) with Research → Architect → Agent templates, Snitch protocol, DoD, technical debt, tickets structure.
  - `.sdd/` for kotef is initialized (`config.json`, `project.md`, `backlog/`, `prompts/01_research/02_architect/03_agent`).
- Governance & quality:
  - Architect and Agent templates enforce: ADRs, MCDM for major choices, Definition of Done alignment, tickets with explicit DoD/tests/files/risks, Snitch escalation via `.sdd/issues.md`.
  - Hidden PE2/verification loops and Quality Gates (tests/build/lint/security/observability) are defined at prompt/spec level.

**What is partially ready**
- Conceptual architecture:
  - High‑level design for kotef (SDD layer + tools + LangGraph orchestrator) is sketched in this `project.md`, but the concrete `architect.md` and tickets are not yet written.
  - The Research/Architect prompts exist, but they do not yet embed the agentic best‑practices doc as explicit context; this will be handled in the first Research run and Architect spec.
- Tooling building blocks (from other projects):
  - Web search (`search.ts` in CallQuest and Navan) and deep‑research (`deep_research.ts` in Navan) are mature but tied to their host projects’ logging/metrics/config.
  - LLM adapters in Navan/CallQuest (`core/llm.ts`) already handle prompts, tools, metrics, and resilience, but are wired to travel / callquest domains.
  - Agent prompts (Navan / CallQuest meta‑agents, planners) provide strong patterns for tool‑first orchestration and verification, but they reference domain‑specific intents and tools.

**What is critically missing**
- Runtime orchestration:
  - No dedicated kotef LangGraph graph yet (no planner/researcher/coder/verifier nodes specific to coding tasks).
  - No CLI or server entrypoint for “run kotef on this repo / ticket”.
- Coding‑specific tool surface:
  - No generic tools yet for:
    - reading/writing files under an arbitrary project root with diff‑based edits,
    - running project‑specific tests/linters/type‑checks driven by that project’s own SDD `architect.md`,
    - inspecting git status/branches safely.
- Agent prompts for coding:
  - There is no meta‑agent / planner prompt specialized for coding tasks that:
    - reads SDD files for the target project,
    - plans tool calls (search, deep research, repo tools),
    - and enforces code‑safety guardrails (no mass rewrites, no secrets, etc.).
- Evaluation & feedback integration:
  - No automated drift checks between SDD spec and repo (contracts vs code),
  - No standard metrics for coding‑agent quality (e.g., % tickets completed without human intervention, test pass rate, diff size, revert rate).

**What needs to be added (to behave like Codex / Claude Code / Q Chat)**
- A **coding meta‑agent** (prompt + graph) that:
  - understands coding intents (implement ticket, refactor module, fix tests, add feature, investigate bug),
  - plans tool calls (search, research, repo operations, tests),
  - and routes outputs through verification before replying.
- A **tool suite** for:
  - FS operations (read/write files, compute diffs, apply patches),
  - test / lint / build commands driven by the target project’s SDD `architect.md`,
  - web search / deep research (adapting existing Navan/CallQuest/Tavily modules),
  - optional embeddings or local indexing if needed later.
- A **LangGraph.js orchestration layer**:
  - planner → researcher → coder → verifier loop with stop rules based on Definition of Done and Snitch protocol.
- Basic **evaluation harness**:
  - golden tasks / repos to measure kotef performance (success rate, time, token cost, revert rate),
  - logging + metrics hooks consistent with best‑practices doc.

In short: the SDD framework is ready as a **spec brain** and governance layer, but kotef still needs its **runtime body** (tools, graph, entrypoints, evaluation) to match modern coding agents.

---

## Existing Code Adaptation Plan (Search, Research, LLM, Agent)

### Web Search & Deep Research

**Directly reusable with minimal glue**
- `personal_projects/finearts/callquest/root/src/tools/search.ts`
  - Domain‑agnostic web search with Serper/Tavily/generic JSON, resilience, timeouts, and structured `SearchResult`.
  - Plan: reuse as kotef’s base `web_search` tool (after extracting/replicating required utilities like `withResilience`, `log`).

**Reusable with moderate adaptation**
- `personal_projects/navan/root/src/tools/brave_search.ts`
- `personal_projects/navan/root/src/tools/tavily_search.ts`
- `personal_projects/navan/root/src/tools/search.ts`
  - Travel‑oriented naming and metrics, but the core patterns (provider selection, resilience, confidence scoring, deep research via Crawlee) are generic.
  - Plan:
    - extract a provider‑agnostic search module for kotef, parameterized by stack/domain (not “travel”);
    - keep resilience, host allowlists, confidence scoring, deep summary logic.
- `personal_projects/navan/root/src/core/deep_research.ts`
  - Multi‑pass deep research pipeline (query optimization, parallel searches, deduplication, synthesis).
  - Plan:
    - adapt prompts (`search_query_optimizer`, `search_summarize`) for general coding / research tasks;
    - expose as a `deep_research` tool for kotef’s planner and researcher nodes.
- `personal_projects/tavily`
  - Provides robust HTTP + Playwright scraping with robots.txt, CAPTCHA detection, fallback logic, and stats.
  - Plan:
    - reuse architectural patterns for safe page fetching and per‑domain behavior;
    - export a simplified “fetch pages / summarize content” tool that kotef can call after search.

**Better to redesign (inspired by existing code)**
- Tight travel‑specific utilities or types inside Navan tools (e.g., “travel info” outputs) should not be ported directly.
  - Plan: design generic `SearchResult` / `DeepResearchResult` types for kotef and map Navan/CallQuest outputs into them.

### LLM Integration

**Reusable with adaptation**
- `personal_projects/navan/root/src/core/llm.ts`
- `personal_projects/finearts/callquest/root/src/core/llm.ts`
  - Mature LLM adapters with:
    - prompt loading (`getPrompt`),
    - metrics,
    - resilience (circuit breakers, timeouts),
    - tool calling (`callChatWithTools` in Navan).
  - Plan for kotef:
    - create `src/core/llm.ts` that:
      - reuses the same shapes and error‑handling patterns,
      - but decouples from Navan/CallQuest‑specific metrics and domains;
    - standardize prompt loading from `src/prompts` and SDD (`.sdd/prompts`), with clear separation between:
      - SDD prompts (Research/Architect/Agent), and
      - runtime meta‑agent / planner prompts.

**OpenAI-compatible Provider Support**
- kotef must support OpenAI-compatible LLM providers (e.g., OpenRouter, local inference servers, custom endpoints).
- Configuration requirements:
  - Separate kotef-specific config file (e.g., `kotef.config.json` or environment variables) with:
    - `baseUrl`: custom API endpoint (defaults to OpenAI's official endpoint if not specified)
    - `apiKey`: authentication token for the provider
    - `model`: model identifier (e.g., `gpt-4`, `anthropic/claude-3-opus`, custom model names)
  - Config should be loaded at runtime and passed to the LLM adapter.
- Implementation notes:
  - The LLM adapter (`src/core/llm.ts`) should accept `baseUrl` as a parameter and use it for all API calls.
  - Maintain compatibility with OpenAI SDK patterns (chat completions, tool calling, streaming).
  - Provider-specific quirks (rate limits, token counting, error formats) should be handled gracefully with fallback behavior.

### Agent Behavior & Prompts

**Patterns to reuse (not direct copy)**
- `personal_projects/navan/root/src/agent/meta_agent.ts`
- `personal_projects/navan/root/src/prompts/meta_agent.md`
- `personal_projects/navan/root/src/prompts/planner.md`
- `personal_projects/finearts/callquest/root/src/prompts/meta_agent.md`
  - These implement:
    - a single meta‑agent controlling tools, planning, verification,
    - planner JSON for tool routing,
    - strong tool‑first and hallucination controls.
  - Plan:
    - design **coding‑specific meta‑agent and planner prompts** for kotef:
      - intents: implement_ticket, refactor, fix_tests, explain_code, research_stack, etc.;
      - tools: SDD read/write, web_search, deep_research, repo tools, tests;
      - verification: check DoD, tests, SDD alignment.
    - implement a new `src/agent/meta_agent.ts` that:
      - follows Navan’s structure (run one turn, log, call tools, store receipts),
      - but uses kotef’s own prompts, slots, and tools.

**Components to rewrite**
- Navan/CallQuest domain‑specific graphs, intent schemas, and “slot memory” tuned to travel/callquest:
  - Plan: use them as architectural examples, but design new slot schemas and flows aligned with coding tasks and SDD artifacts.

---

## Proposed kotef Project Structure

Target layout (initial scaffolding):

```text
kotef/
  brain/                     # SDD toolkit (templates, bin/*) — shared "brain" framework
  .sdd/                      # SDD spec for kotef itself
    project.md               # this file (project description + readiness + plans)
    best_practices.md        # to be generated via 01_research
    architect.md             # to be generated via 02_architect
    backlog/
      tickets/
        open/                # implementation tickets for kotef
        closed/
    prompts/
      01_research.prompt.md
      02_architect.prompt.md
      03_agent.prompt.md
  src/
    core/
      llm.ts                 # LLM adapter (inspired by Navan/CallQuest)
      prompts.ts             # prompt loader for kotef runtime
      config.ts              # runtime configuration (API keys, paths, limits)
    tools/
      web_search.ts          # adapted from CallQuest/Navan search modules
      deep_research.ts       # adapted from Navan deep_research + Tavily patterns
      repo_fs.ts             # file read/write + diff tools for target projects
      test_runner.ts         # run tests/linters commands from target project’s SDD architect.md
    agent/
      meta_agent.ts          # main coding meta‑agent (using LangGraph.js or similar)
      planner.ts             # planner logic / tool‑plan JSON adapter
      graphs/
        coding_graph.ts      # LangGraph graph (planner → researcher → coder → verifier)
  prompts/
    meta_agent.md            # meta‑agent prompt for coding tasks
    planner.md               # planner prompt for tool routing
    verify.md                # optional verification prompt
  README.md                  # top‑level documentation for running kotef
```

Next steps after this spec update:
- Use `brain/bin/sdd-prompts` + `01_research` to generate `.sdd/best_practices.md` for kotef, explicitly including insights from  
  `/Users/sasha/IdeaProjects/allthedocs/learning/research/ai_engineering/agentic_systems_building_best_practices.md`.
- Use `02_architect` to produce `architect.md` and seed `backlog/tickets/open` with:
  - initial implementation tickets for `src/core/llm.ts`, `src/tools/web_search.ts`, `src/tools/deep_research.ts`,
  - design/implementation of the LangGraph coding graph and meta‑agent,
  - evaluation and metrics tickets for measuring kotef’s performance.
