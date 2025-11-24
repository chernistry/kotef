# kotef — spec‑driven coding agent

> “Give me a repo and a goal. I’ll figure out the rest.”

kotef is an autonomous coding agent that **writes its own spec and tickets, then ships the code**. You point it at a project, tell it what you want, and it does the boring parts: research, architecture, tickets, patches, tests.

The idea grew out of two prior experiments:
- [synapse](https://chernistry.github.io/synapse/) — adaptive governance, metric‑driven agents.
- [sddrush](https://github.com/chernistry/sddrush) — tiny SDD toolkit and prompt templates.

kotef basically fuses them into a coding agent.

## What it actually does

- You run:  
  `kotef run --root ./my-repo --goal "add pagination to blog posts"`
- kotef:
  - scans the repo,
  - hits the web for best practices,
  - **bootstraps `.sdd/`** for that project (project.md, architect.md, best_practices.md, tickets),
  - then follows those specs like a stubborn senior dev:
    - plans,
    - edits code via diffs,
    - runs tests,
    - logs everything and writes a run report.

Stack: Node.js 20, TypeScript, LangGraph.js, OpenAI‑style tools. Under the hood it reuses battle‑tested bits from personal projects plus the SDDRush prompt flow.

## Why this is different

- It doesn’t just “autocomplete code” — it **thinks in specs and tickets**.
- If your repo has no process, it invents a minimal one for you (SDD bootstrap).
- If you already have `.sdd/`, it treats it as law, not a suggestion.
- The long‑term goal is a drop‑in “developer in a box” you can throw at real projects and CI.

## We badly need contributors

If any of this sounds fun, we need help. Especially if you:
- hack on **agent frameworks** (LangGraph, LangChain, AutoGen, CrewAI, Swarm, whatever),
- enjoy **prompt engineering** for serious coding work (not just toy chat prompts),
- like building **coding copilots / refactoring tools**,
- care about making agents safe, observable and actually useful.

Stuff you could grab:
- harden runtime prompts using modern prompt‑eng best practices,
- wire richer graphs (bootstrap → planner → researcher → coder → verifier),
- adapt more web/search/scraping strategies,
- build eval scenarios to see if kotef is actually good, not just "vibes".

There’s a `.sdd/` with tickets in `./.sdd/backlog/tickets/open/` — pick one, or open an issue if you see a sharper way to do things.

PRs, experiments, and “this design is cursed, here’s better” issues are all welcome.

## Prompt evals (quick and dirty)

- `npm run eval:prompts` runs a 5-task dev set from `devdata/` against the built CLI and drops a JSON report in `devdata/results/`.
- Set `KOTEF_EVAL_SKIP_AGENT=1` if you just want to smoke-test the harness without calling an LLM.
- Use the reports to compare prompt/model tweaks and watch for regressions.

## License

The core of **kotef** is open source under the [Apache 2.0 License](./LICENSE).

You are free to use, modify, and distribute it, including in commercial projects, as long as you comply with the license terms (e.g. preserve copyright and notices).

Future hosted/managed offerings (e.g. "kotef Cloud" or enterprise features) may be provided under separate commercial terms.

"kotef" is the name of the open-source project. Using the name for derived commercial products or services should not imply official endorsement by the project maintainers.
