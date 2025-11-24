# kotef — unapologetically spec‑driven coding agent

> “Give me a repo and a goal. I’ll figure out the rest.”

kotef is an autonomous coding agent that **writes its own spec and tickets, then ships the code**. You point it at a project, tell it what you want, and it does the boring parts: research, architecture, tickets, patches, tests.

The idea grew out of two prior experiments:
- [synapse](https://chernistry.github.io/synapse/) — adaptive governance, metric‑driven agents.
- [sddrush](https://github.com/chernistry/sddrush) — tiny SDD toolkit and prompt templates.

kotef basically fuses them into a coding agent.

## TL;DR workflow

```bash
node bin/kotef run \
  --root /path/to/repo \
  --goal "Create a Python GUI with a Close button" \
  --yolo   # optional: fast-and-loose mode
```

Under the hood:

- **LangGraph flow.** `planner → researcher → coder → verifier → snitch` with run reports, command/time budgets, execution profiles (`strict/fast/smoke/yolo`).
- **Web search & deep research.** Tavily + scraping + LLM summarizer feed best practices into the spec so the agent isn’t hallucinating 2019 blog posts.
- **Command policies.** Profiles cap heavy commands/tests so `fast` stays fast and `yolo` finishes after functional success instead of chasing lint forever.
- **Failure feedback loop.** Runs are bounded: failing tests get summarised, attempts are tracked, and unresolved issues land in `.sdd/issues.md`.

CLI modes:

- `kotef run …` — one-shot automation, leaves a run report in `.sdd/runs/`.
- `kotef chat` —  interactive loop: generate tickets, pick which ones to execute, watch progress ticket by ticket.

## What’s baked in right now

- SDD bootstrap when a repo has no `.sdd/`.
- Respect for existing `.sdd/` (project law).
- Planner retries + JSON enforcement so runs don’t die on parse errors.
- Researcher skips web hits if `.sdd/best_practices.md` already exists.
- Coder tool loop with diff-first edits, profile-aware command/test limits, and fallback run summaries.
- Verifier adapts to Python/TS stacks, honours profile semantics, and remembers functional probes (e.g. `flet run`, `npm start`).
- Snitch protocol writes structured issues when specs/goals conflict or attempts are exhausted.

## We desperately need help

I’m building this to feel like “a stubborn senior dev in a CLI”. It’s getting there, but there’s plenty left:

- harden runtime prompts using the best playbook you know,
- refine execution-profile policies (`strict` vs `fast` vs `yolo`),
- improve deep research / scraping / Tavily/Brave integrations,
- build eval harnesses and CI scenarios,
- wire richer graphs (e.g., orchestrator agent, feedback loops between planner/researcher/coder),
- make the CLI slicker (ticket dashboards, issue summaries, etc.).

If you’re into LangGraph, AutoGen/CrewAI/Swarm, prompt engineering for real code, or just want coding copilots that don’t lie — I’d love your help. 
Contributors are begged for, especially anyone who can stress-test the agent on real-world repos.

## License

Apache 2.0 — see [LICENSE](./LICENSE). Forks, experiments, and “this design is cursed, here’s better” issues are all welcome. Feel free to build on it commercially; just keep notices intact and don’t imply official endorsement.
