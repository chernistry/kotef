# kotef — spec‑driven coding agent

> “Give me a repo and a goal. I’ll figure out the rest.”

kotef is a LangGraph‑based coding agent that **treats SDD as law**, does its own research/architecture/tickets, and then edits your repo via safe diffs.

It grew out of:
- [synapse](https://chernistry.github.io/synapse/) — adaptive governance, metric‑driven agents.
- [sddrush](https://github.com/chernistry/sddrush) — tiny SDD toolkit and prompt templates.

kotef basically fuses them into a coding agent.

---

## TL;DR

One‑shot run:

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

## What it actually does

- **SDD‑first.** If `.sdd/` is missing, the orchestrator builds `project.md`, `architect.md`, `best_practices.md` and an initial ticket backlog from templates (`src/agent/prompts/brain/`).
- **Graph, not spaghetti.** Main flow: `planner → researcher → coder → verifier → snitch/ticket_closer`, with budgets and profiles (`strict/fast/smoke/yolo`).
- **Error‑first & diff‑first.** Coder runs a diagnostic command first, then edits via minimal unified diffs with strict patch validation.
- **Goal‑first verification.** Verifier decides if the goal is met, and can return `done_partial` when the feature works but some global tests still fail.
- **Snitch.** If a request conflicts with SDD or the agent is stuck, Snitch writes a structured entry to `.sdd/issues.md` instead of pretending everything is fine.

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
