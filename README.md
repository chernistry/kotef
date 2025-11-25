# kotef — an agent with a brain and a toolbox

> “Give me a repo and a goal. I’ll figure out the rest.”

kotef is a LangGraph‑based coding agent that:
- keeps a **“brain”** — it thinks in goals, tickets, and project rules, and
- drives a **“body”** — tools that read/edit files, run tests, and hit the web,
with a hard bias towards small diffs and not trashing your repo.

It grew out of:
- [synapse](https://chernistry.github.io/synapse/) — adaptive governance, metric‑driven agents.
- [sddrush](https://github.com/chernistry/sddrush) — tiny spec‑driven dev toolkit and prompt templates.

kotef basically fuses them into a coding agent.

---

## TL;DR

One‑shot run (brain + tools in one go):

```bash
node bin/kotef run \
  --root /path/to/repo \
  --goal "Create a Python GUI with a Close button" \
  --profile fast
```

Interactive (tickets + progress in a small TUI‑style UI):

```bash
node bin/kotef chat --root /path/to/repo
```

---

## What it actually does (brain vs body)

- **Brain (project understanding).**
  - If there’s no `.sdd/` folder yet, kotef creates a tiny “spec brain” for your repo: `project.md`, `architect.md`, `best_practices.md` and an initial ticket backlog from templates (`src/agent/prompts/brain/`).
  - That folder becomes the source of truth for goals, constraints, and coding standards.
- **Body (tools that touch the repo).**
  - Main flow is a small graph: `planner → researcher → coder → verifier → snitch/ticket_closer`, with budgets and execution profiles (`strict/fast/smoke/yolo`).
  - Coder runs diagnostics first, then applies minimal unified diffs with strict validation instead of rewriting whole files.
  - Verifier runs stack‑appropriate commands (build/tests/lint), and can say “functionally done but some global checks still red” via `done_partial`.
  - Snitch writes structured issues into `.sdd/issues.md` when requests conflict with rules or the run is stuck, instead of silently looping.

---

## Why you might care

- You probably want this if you want an agent that:
  - actually reads specs and tickets instead of “guessing the API”,
  - respects tests but can say “functionally done, remaining stuff is tech debt”,
  - doesn’t burn 200 shell commands re‑reading the same files.
- Inside:
  - Node.js 20 + TypeScript + LangGraph,
  - strongly‑typed `AgentState`,
  - runtime prompts in `src/agent/prompts/body/`,
  - SDD templates in `src/agent/prompts/brain/`,
  - deep web research in `src/tools/deep_research.ts`.

---

## Getting started

Very short version:

```bash
cp .env.example .env   # or create .env manually
# KOTEF_API_KEY=...
npm install
npm run build

node bin/kotef run --root /path/to/repo --goal "Do X"
```

If the repo has no `.sdd/`, kotef will first bootstrap the SDD “brain”, then switch to the main graph.

Full technical docs (CLI flags, env, architecture, profiles, safety) live in `docs/KB.md` 📚

---

## Contributing

- Things that would be especially useful:
  - a stricter Verifier,
  - a smarter Planner (fewer loops, more common sense),
  - custom profiles/strategies for different stacks,
  - MCP integration with external code servers.
- See `CONTRIBUTING.md` and SDD tickets under `.sdd/backlog/tickets/`.

PRs, “here’s how X solves this, let’s steal/beat it” issues, and stress tests on your real‑world repos are very welcome.

---

## License

Apache 2.0 — see [LICENSE](./LICENSE). Use it, fork it, ship it inside your own pipelines; just don’t imply any kind of “official” endorsement.
