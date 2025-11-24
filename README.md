# kotef — Spec‑Driven Coding Agent

kotef is an autonomous coding and research agent that thinks in specs and tickets, then executes them safely on your repo.

It aims for “Claude Code / Q / ChatGPT Code”‑class behavior, but with a hard, explicit brain: `.sdd/*` acts as the source of truth for goals, architecture, Definition of Done, and backlog. The runtime agent just obeys.

## What is kotef?

- **SDD‑first brain**  
  Long‑term goals, constraints, architecture, coding standards, and tasks live in `.sdd/`:
  - `project.md` – high‑level intent and Definition of Done.
  - `best_practices.md` – research and agentic best practices.
  - `architect.md` – implementation‑ready architecture and component spec.
  - `backlog/tickets/*` – small, observable tickets the agent can execute.

- **Agentic body**  
  Implemented in **Node.js 20 + TypeScript + LangGraph.js**, kotef runs as a CLI that:
  - reads `.sdd/*` for the target project,
  - uses tools for web search, deep research, repo inspection, patch generation, and test running,
  - applies code changes via diffs only, within a sandboxed workspace,
  - produces structured logs and run reports under `.sdd/runs/`.

- **Two SDD layers**  
  - `brain/` – a reusable SDD framework (Research → Architect → Agent templates, CLI helpers).  
  - `.sdd/` in this repo – SDD that describes **kotef itself** (how the agent should be built and behave).

In other words: the “brain” is written down as specs and tickets; the agent is the execution engine that turns that plan into code.

## Status

Early‑stage, experimental, but aiming for production‑grade patterns:
- Core architecture and best practices are captured in `.sdd/`.
- Tickets in `.sdd/backlog/tickets/open/` outline the first implementation milestones (core config/LLM adapter, safe FS tools, web search/deep research, LangGraph graph, CLI, evaluation).
- Runtime code is work‑in‑progress and evolving alongside the SDD.

If you want to help shape a next‑generation coding agent from the ground up, this is the right time to jump in.

## How it works (short version)

1. You describe your project using SDD (`.sdd/project.md`, `.sdd/architect.md`, tickets).  
2. kotef loads that “brain”, reads the open ticket, and plans a run.  
3. It calls tools for search, research, file I/O, and tests, generating diffs instead of blind writes.  
4. It stops when the ticket’s Definition of Done is met or when guardrails (time, tokens, web calls) say “enough”.  
5. It emits a run report summarizing what changed and why.

The same pattern is used here: kotef uses SDD to build kotef.

## Contributing (we need you)

This project **urgently needs contributors**, especially if you:
- have experience with **prompt engineering** for coding agents,
- have built **agentic systems** (LangGraph, LangChain, AutoGen, CrewAI, Swarm, custom frameworks),
- have worked on **coding copilots** or refactoring tools,
- care about **spec‑driven engineering**, safety, and observability.

Ideas for high‑impact contributions:
- refining SDD prompts and agent prompts for real‑world coding workflows,
- improving the LangGraph graph design (planner / researcher / coder / verifier),
- hardening web search, deep research, and scraping safety,
- designing evaluation scenarios and metrics for coding‑agent quality,
- integrating more LLM providers and model profiles (fast vs frontier).

No change is “too small”: tests, docs, and examples are all extremely valuable.

### Getting started

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```
2. Read `.sdd/project.md` and `.sdd/architect.md` to understand the current plan.  
3. Pick an open ticket under `.sdd/backlog/tickets/open/` and follow its spec.  
4. Open a PR that links the ticket and briefly explains your approach.

We try to keep tickets small, observable, and well‑scoped so that contributors can ship value in focused increments.

## License

TBD (see repository for current licensing status).  
Until then, treat the project as experimental and evolving.
