# kotef — unapologetically spec-driven coding agent

_heb. 'kotef' (קוטף) — 'one who picks/harvests' (wordplay with 'katef' כתף — 'a shoulder to support you')_

> "Give me a repo and a goal. I'll figure out the rest."

![kotef in action](assets/screenshot.png)

kotef is a LangGraph-based coding agent that is **shamelessly meticulous** about three things:

- reading and updating a **real project spec** (its "brain"),  
- doing **fresh research** so it doesn't hallucinate from some random 2019 blog post, and  
- touching your code only via **small, validated diffs** (its "body").

It grew out of:
- [synapse](https://chernistry.github.io/synapse/) — adaptive governance, metric-driven agents.
- [sddrush](https://github.com/chernistry/sddrush) — tiny spec-driven dev toolkit and prompt templates.

kotef basically fuses them into a coding agent.

---

## TL;DR

One-shot run (brain + tools in one go):

```bash
node bin/kotef run \
  --root /path/to/repo \
  --goal "Create a Python GUI with a Close button" \
  --profile fast
```

Interactive (tickets + progress in a small TUI-style UI):

```bash
node bin/kotef chat --root /path/to/repo
```

---

## What it actually does (brain vs body)

- **Brain (project understanding).**
  - If there's no `.sdd/` folder yet, kotef creates a tiny spec brain for your repo: `project.md`, `architect.md`, `best_practices.md` and an initial ticket backlog.
  - That folder becomes the source of truth for goals, constraints, and coding standards — updated via tickets, not vibes.
  - The agent always goes back to this "brain" when deciding what to do next.
- **Body (tools that touch the repo).**
  - Main flow: `planner → researcher → coder → verifier → snitch/ticket_closer`, with budgets and execution profiles.
  - It **thinks before it pokes the repo**: planner decides, researcher fetches fresh context, only then coder touches files.
  - Researcher does web search + deep research with quality scoring, so the agent works off up-to-date docs instead of cargo-culting stale answers.
  - Verifier runs sanity checks so changes aren't just "looks good to me", and Snitch files issues instead of silently looping when something is off.

---

## Why you might care

You probably want this if you want an agent that:
- actually reads specs and tickets instead of "guessing the API",
- uses **current docs** (and can admit "not enough info") instead of confidently hallucinating outdated answers,
- thinks through a goal and plan before it starts hammering your filesystem,
- can say "functionally done, remaining stuff is tech debt" instead of chasing tiny nits forever,
- **auto-commits per ticket** so you get clean git history without manual intervention,
- **detects loops and bails out** instead of burning tokens on the same failing approach.

### Under the hood

- Node.js 20 + TypeScript + LangGraph, strongly-typed `AgentState`
- **Deep web research** with quality scoring, source diversity tracking, and raw context preservation (`.sdd/context/`)
- **LSP diagnostics** for TypeScript/JS — real-time error detection, not just "tests pass"
- **Functional probes** — "does `npm run dev` actually start?" matters more than lint warnings
- **Circuit breakers** — per-edge loop limits (`planner→researcher`, `planner→coder`, etc.) with automatic abort when stuck
- **Git integration** — auto-commit after each successful ticket, automatic ticket lifecycle (open → closed)
- **Execution profiles** (`strict`/`fast`/`smoke`/`yolo`) — trade off thoroughness vs speed
- Experimental MCP support for external code-intel servers

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

If the repo has no `.sdd/`, kotef will first bootstrap the SDD "brain", then switch to the main graph.

Full technical docs (CLI flags, env, architecture, profiles, safety) live in `docs/KB.md` 📚

---

## Contributing

Things that would be especially useful:
- a stricter Verifier,
- a smarter Planner (fewer loops, more common sense),
- custom profiles/strategies for different stacks,
- more MCP tool integrations.

See `CONTRIBUTING.md` and SDD tickets under `.sdd/backlog/tickets/`.

PRs, "here's how X solves this, let's steal/beat it" issues, and stress tests on your real-world repos are very welcome.

---

## License

Apache 2.0 — see [LICENSE](./LICENSE). Use it, fork it, ship it inside your own pipelines; just don't imply any kind of "official" endorsement.
