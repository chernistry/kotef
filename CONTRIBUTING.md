# Contributing to kotef

First of all: thanks for even looking at this. kotef exists for people who enjoy building **real** agentic systems, not just demo GIFs.

This doc is a lightweight guide on how to help without fighting the architecture or the SDD.

---

## Mental model of the project

kotef is:

- a **LangGraph.js**-based coding agent (`planner → researcher → coder → verifier → snitch/ticket_closer`),
- with **SDD** (`.sdd/*`) as its “brain” (project spec, best_practices, architect, tickets),
- wired for **error-first debugging** (run build/tests first), **diff‑first edits**, and **bounded loops**.

If you’re into:

- agent orchestration,
- prompt engineering beyond “just vibes”,
- safe patching / code editing,
- eval harnesses & benchmarks for coding agents,

…you’re in the right place.

---

## Where help is most valuable

Roughly in order of leverage.

### 1. Eval harnesses & scenarios

Goal: make kotef **boring and predictable** on real tasks, and interesting to watch on hard ones.

High‑impact ways to help:

- Add new **scenarios** under `scripts/eval/scenarios/` and matching fixtures:
  - messy monorepos, weird build setups, flaky tests, multi‑service layouts.
  - “sadistic but realistic” coding tasks are welcome (within license / ethics).
- Extend `scripts/eval/run_eval.ts`:
  - better metrics (commands/tests/web calls, loop counters, terminal status),
  - scenario‑level thresholds and summaries.
- Design mini‑leaderboards:
  - e.g. “How many runs finish as `done_success` vs `done_partial`?”, “Average tool calls per scenario”.

This is the easiest way to push kotef into “serious agent” territory and make it interesting for others to compare against.

### 2. Agent brains: planner / coder / verifier

The core loop is already solid, but there’s room to make it feel even more like a stubborn senior dev:

- **Planner**
  - Tune decision rules and prompts so it:
    - prefers error‑first plans (`run_diagnostic` first),
    - uses loop counters & research quality correctly,
    - leans into “goal‑first DoD” (functionally done vs chasing lint forever).
  - Add tests for loop detection and budgeting behaviour.

- **Coder**
  - Improve tool policies:
    - when to use `write_patch` vs `apply_edits` vs full `write_file`,
    - better detection of “junior exploration” patterns (50 `read_file` calls, no diagnostics).
  - Add more regression tests around:
    - patch validation (no markdown / `<tool_call>` in diffs),
    - error‑first flow (first tool call is `run_diagnostic` on non‑tiny tasks).

- **Verifier**
  - Help finish the “goal‑first verification” story:
    - functional probes (`npm run dev`, `npm start`, `python app.py`),
    - differentiating crash vs “lint is mad but app runs”.
  - Tighten partial‑success semantics (`done_partial`) per execution profile.

### 3. Research & web layer

Today we use Tavily + a shallow/deep split:

- Extend `web_search.ts` and `deep_research`:
  - better host allowlists / blocklists,
  - more robust failure handling,
  - smarter query plans (query expansion, dedup, reuse of previous results).
- Add tests + fixtures for prompt injection and weird content.
- Port / adapt patterns from your favourite research agents (Navan / Tavily / others) as long as they fit SDD + security rules.

This is where “avant‑garde” behaviour comes from: grounded agents that actually *read* the web instead of hallucinating docs.

### 4. Prompt engineering & PE2‑style tuning

The prompts live under:

- runtime agent “body” prompts: `src/agent/prompts/body/`
- SDD/brain templates: `src/agent/prompts/brain/`
- plus policy context in `.sdd/architect.md` / `.sdd/best_practices.md`.

Useful contributions:

- Rewrite prompts as actual **policies**, not paragraphs:
  - explicit rules, examples, and “don’t do this” sections.
- Run **eval‑driven** prompt experiments:
  - use `scripts/eval` and your own scenario sets to compare versions,
  - keep empirical results (what improved, what broke).
- Add chain‑of‑verification / self‑critique patterns where they make sense **without** exploding cost.

If you like Prompt Engineering 2.0 / “Less wordsmithing, more signal”, this is your playground.

### 5. UX: CLI, reports, IDE integration

Nice ways to make kotef feel less like a research toy:

- CLI:
  - better progress output,
  - more granular flags (profiles, limits, dry‑run behaviours),
  - user‑friendly errors when SDD is missing/broken.
- Run reports:
  - richer summaries in `.sdd/runs/*`,
  - functional probe summaries, loop/budget overviews.
- Integrations:
  - thin wrappers for VS Code / JetBrains / Neovim that shell out to `kotef run` / `kotef chat`,
  - nothing too heavy‑weight, just enough to try it in real workflows.

### 6. Security & safety hardening

We already block SSRF‑ish URLs, path traversal, and weird patches, but this is a never‑ending story.

- Threat model review:
  - file I/O tools (`src/tools/fs.ts`, `fetch_page.ts`, `web_search.ts`),
  - prompt injection surfaces (research, SDD ingestion).
- Harden:
  - host allowlists, blocked IP ranges, protocol restrictions,
  - logging (no secrets in logs / run reports).
- If you know OWASP 2025 and modern LLM safety work, your paranoia is welcome here.

---

## How to work with SDD

SDD is “law” for this repo.

- Specs live under `.sdd/`:
  - `project.md`, `architect.md`, `best_practices.md`,
  - backlog tickets under `.sdd/backlog/tickets/{open,closed}/`.
- For non‑trivial changes:
  - **add or update a ticket** in `.sdd/backlog/tickets/open/NN-some-slug.md`,
  - describe Objective, DoD, Steps, Affected Files, Tests, Risks, Dependencies (follow existing tickets).
- If your change alters architecture / behaviour:
  - mention it in `.sdd/architect.md`,
  - or propose a new ticket to do so.

If you’re unsure whether something belongs in SDD or just in code comments, default to SDD.

---

## Ground rules for contributions

### 1. Style & stack

- Node.js 20, TypeScript, ES modules.
- Follow existing code style:
  - no one‑letter variables for anything non‑trivial,
  - keep functions small and focused,
  - prefer explicit types.
- Run:
  - `npm run build`
  - `npm test`
  before opening a PR (or at least the relevant subset of tests).

### 2. Diff‑first, safety‑first edits

- Use **diff‑based** edits where possible:
  - small changes: `write_patch`/`applyEdits` semantics,
  - large rewrites: full `write_file` with whole‑file content.
- Never assume the agent or your code can write outside the project root:
  - `resolvePath` enforces this, but don’t try to be clever.
- Don’t add new tools that:
  - hit arbitrary network targets without allowlists,
  - shell out into random parts of the filesystem.

### 3. Prompts & LLM calls

- Treat prompts like code:
  - stable structure, clear sections, minimal fluff.
- If you change a prompt that affects behaviour:
  - update or add tests under `test/agent/*.test.ts`,
  - ideally show a small eval comparison (even a local JSON in `scripts/eval/results/`).
- Avoid leaking chain‑of‑thought / internal reasoning in user‑visible outputs.

### 4. Tests & regression safety

- Aim for:
  - **targeted tests** next to whatever you changed,
  - **scenario tests** where appropriate (via `scripts/eval` or `test/e2e.test.ts`).
- When fixing a bug from `logs/run.log` or `.sdd/issues.md`:
  - add a test that would have failed before your fix.

---

## How to propose changes

1. **Open an issue** (or ticket in `.sdd/backlog/tickets/open`) describing:
   - what you want to change,
   - why (link to logs, tickets, or best‑practices),
   - rough idea of the approach.
2. If it’s non‑trivial, sketch the change in terms of:
   - which node(s) (planner/researcher/coder/verifier/snitch),
   - what new state or tools you need,
   - how it fits the metric profile (SecRisk, Maintainability, DevTime, Perf, Cost, DX).
3. Send a PR:
   - keep it focused (one ticket / idea per PR),
   - mention which ticket(s) it closes.

It’s totally fine to start small: docs, tests, eval scenarios, tiny safety fixes. Those often have the biggest impact on how this thing behaves in the wild.

---

## Code of Conduct (lightweight)

No long manifesto here:

- Be respectful.
- Assume everyone is trying to make the agent less stupid, not more.
- Strong opinions are welcome; personal attacks are not.

If something feels off, open an issue instead of letting it simmer.
