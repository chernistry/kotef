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

Or, for an interactive loop that generates tickets and executes them one by one:

```bash
node bin/kotef chat --root /path/to/repo
```

Under the hood:

- **SDD‑first brain.** If there is no `.sdd/` yet and you give it a `--goal`, it runs a small LangGraph “orchestrator” (`sdd_orchestrator`) that does deep research, writes `.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md` and a backlog of tickets from templates in `brain/templates/`.
- **LangGraph flow.** After SDD exists, it switches to the main graph: `planner → researcher → coder → verifier → snitch/ticket_closer`, with run reports, command/time budgets, and execution profiles (`strict/fast/smoke/yolo`).
- **Web search & deep research.** Tavily + scraping + LLM summarizer + self‑scored feedback loops (relevance/coverage/confidence) with up to 3 refined queries when results are weak.
- **Command policies.** Profiles cap heavy commands/tests so `fast` stays fast and `yolo` finishes after functional success instead of chasing lint forever.
- **Failure feedback loop.** Runs are bounded: failing tests get summarised, attempts are tracked, research quality is logged, and unresolved issues land in `.sdd/issues.md`.

CLI modes:

- `kotef run …` — one-shot automation, leaves a run report in `.sdd/runs/`.
- `kotef chat` —  interactive loop: generate tickets, pick which ones to execute, watch progress ticket by ticket.

## How this thing “thinks”

Very hand‑wavy, but enough to get the vibe:

- **Spec first, code later.** The SDD orchestrator graph (`sdd_research → sdd_architect → sdd_tickets`) uses deep research plus prompt templates to build best practices, an architecture doc, and a ticket backlog before the main agent ever touches your code.
- **Stateful brain.** The main LangGraph keeps a single `AgentState` with SDD text, the current ticket, plan JSON, research findings, file diffs, test results, loop counters, and a run profile. Every node reads that state and writes back a small patch.
- **Planner as dispatcher.** `planner` uses a runtime prompt (`src/agent/prompts/planner.md`) to decide the next hop (`researcher` / `coder` / `verifier` / `snitch` / `done`), plus a mini plan and “needs” (files to inspect, tests to run, queries to ask). JSON is enforced and auto‑repaired with `jsonrepair` so bad LLM output does not crash the run.
- **Research that can say “not enough”.** `researcher` plans queries via its prompt, then either calls the deep research module (`src/tools/deep_research.ts`) or a shallow web search, and returns findings plus a quality signal (`relevance/coverage/confidence/shouldRetry`). SDD best practices are always in the context so the agent does not re‑discover the obvious.
- **Coder as tools‑only agent.** `coder` runs a tool‑calling LLM over a fixed toolbox (`read_file`, `list_files`, `write_file`, `write_patch`, `run_command`, `run_tests`) with budgets defined per profile in `src/agent/profiles.ts`. It prefers small patches, keeps an internal chat history, and bails once it runs out of turns or useful tool calls.
- **Verifier as grumpy QA.** `verifier` autodetects stack (`node`, `vite_frontend`, `python`, `go`…) and picks sane test/build/lint commands, then runs them respecting profile limits. A verifier prompt decides if the goal is actually met (including “partial success” when global tests are flaky but the requested feature works).
- **Snitch + ticket closer.** If the planner decides the request is blocked or violating SDD “law”, `snitch` logs a structured entry into `.sdd/issues.md` and keeps the run as “partial/blocked”. If everything is good and we are running from a ticket, `ticket_closer` moves the ticket from `.sdd/backlog/tickets/open` to `closed/`.

Net effect: it behaves like a stubborn senior dev that insists on a spec, keeps notes on what failed, and tries not to spam `npm test` more than your laptop deserves.

## What’s baked in right now

- SDD bootstrap when a repo has no `.sdd/`.
- Respect for existing `.sdd/` (project law) — the agent reads project/architect/best_practices/tickets instead of trying to “re‑imagine” your repo.
- Planner retries + JSON enforcement so runs don’t die on slightly broken LLM outputs.
- Researcher that leans on `.sdd/best_practices.md` and only does extra web research per run when the planner asks for it; deep research is quality‑scored and query‑refined.
- Coder tool loop with diff‑first edits, profile‑aware command/test limits, and “tiny task” rules that skip absurdly heavy commands for small fixes.
- Verifier that adapts to Node/Vite/Python/Go stacks, honours profile semantics, and remembers functional probes (e.g. `npm test`, `npm run dev`, `pytest`).
- Snitch protocol writes structured issues when specs/goals conflict or attempts are exhausted; run reports land in `.sdd/runs/` with metrics and verification details.

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
