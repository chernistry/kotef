# Kotef Knowledge Base

This is the “how it actually works” doc — all the knobs, internals, and gotchas in one place.

If you just want to run it, skim the CLI section and come back here when something feels weird.

---

## 1. Installation & Requirements

- **Runtime**: Node.js 20 LTS (recommended)  
- **Language**: TypeScript (compiled to JS in `dist/`)  
- **OS**: macOS / Linux; Windows should work via WSL

### 1.1. Install

```bash
git clone https://github.com/chernistry/kotef.git
cd kotef
npm install
npm run build
```

The CLI entrypoint is `bin/kotef`:

```bash
node bin/kotef --help
```

You can also add a `kotef` bin to your PATH via a small wrapper script or npm global install if you prefer.

### 1.2. Minimal .env

Create `.env` in the repo root:

```bash
KOTEF_API_KEY=sk-...
# or:
# OPENAI_API_KEY=sk-...

# Optional overrides:
# CHAT_LLM_BASE_URL=...
# CHAT_LLM_MODEL=gpt-4.1.1
# SEARCH_API_KEY=...
```

Environment variables are read in `src/core/config.ts`.

---

## 2. Configuration & Env Vars

Config is centralized in `KotefConfig` (`src/core/config.ts`), built from env + CLI.

### 2.1. Core LLM config

- `KOTEF_API_KEY` / `CHAT_LLM_API_KEY` / `OPENAI_API_KEY`  
  Primary OpenAI‑compatible API key. One of these **must** be set.
- `CHAT_LLM_BASE_URL` / `KOTEF_BASE_URL` / `OPENAI_BASE_URL`  
  Override the HTTP endpoint (OpenAI, OpenRouter, your own gateway).
- `CHAT_LLM_MODEL` / `KOTEF_MODEL_FAST` / `KOTEF_MODEL_STRONG` / `OPENAI_MODEL`  
  Models used for planning/research and heavy codegen (defaults: `gpt-4.1.1` for both).

### 2.2. Search / web research

- `SEARCH_API_KEY` / `TAVILY_API_KEY` / `SERPER_API_KEY`  
  API key used by `src/tools/web_search.ts` / `src/tools/deep_research.ts`.

### 2.3. Runtime guardrails

- `KOTEF_ROOT_DIR`  
  Default project root if `--root` is not passed.
- `KOTEF_DRY_RUN` (`true`/`false`)  
  Default dry‑run mode. If omitted, **dry‑run is ON**.
- `MAX_RUN_SECONDS`  
  Hard-ish wall‑clock limit for a run (defaults to `300`).
- `MAX_TOKENS_PER_RUN`  
  Soft budget for total tokens (defaults to `100000`).
- `MAX_WEB_REQUESTS_PER_RUN`  
  Max outbound web requests (search + fetch) per run (defaults to `20`).
- `MAX_CODER_TURNS`  
  Hard cap for coder tool‑loop turns. `0` = use profile‑based defaults.
- `KOTEF_MOCK_MODE` (`true`/`false`)  
  If `true`, LLM + tools simulate behaviour for tests/dev.

---

## 3. CLI: Commands & Flags

CLI lives in `src/cli.ts` / `bin/kotef`.

### 3.1. `kotef run`

One‑shot “do the thing” mode.

```bash
node bin/kotef run \
  --root /path/to/repo \
  --goal "Implement X" \
  --profile fast \
  --max-time 300 \
  --max-tokens 50000
```

Flags:

- `--root <path>`  
  Project root (where `.sdd/` lives or will be created). Defaults to `cwd` or `KOTEF_ROOT_DIR`.
- `--ticket <id>`  
  Ticket ID prefix under `.sdd/backlog/tickets/open/NN-some-slug.md`.  
  Example: `--ticket 17` picks `17-goal-aware-verification-...`.
- `--goal <text>`  
  Natural‑language goal. If `.sdd/` is missing, this triggers SDD bootstrap.
- `--dry-run`  
  No writes, only planning/research/logging.
- `--max-time <seconds>`  
  Per‑run wall‑clock cap (overrides `MAX_RUN_SECONDS`).
- `--max-tokens <count>`  
  Soft token budget (hints for the agent; not a hard limit).
- `--profile <strict|fast|smoke|yolo>`  
  Execution profile. See below.
- `--max-coder-turns <count>`  
  Hard upper bound on coder tool‑loop steps (overrides env/profile defaults).
- `--yolo`  
  Shortcut: bias planner/coder towards `yolo` profile (aggressive).
- `--auto-approve`  
  Skip interactive confirmations (used for CI / scripted runs).

Outputs:

- CLI logs on stdout/stderr.
- `.sdd/runs/<timestamp>_<run-id>.md` — run report (plan, tests, metrics).
- `.sdd/issues.md` — appended when Snitch files an issue.

### 3.2. `kotef chat`

Interactive mode (ticket‑centric).

```bash
node bin/kotef chat --root /path/to/repo
```

Rough flow:

- loads/bootstraps `.sdd/`,
- lets you pick tickets / goals,
- runs the LangGraph per ticket and shows TUI‑style output (framed blocks).

Under the hood it is still `buildKotefGraph` + `AgentState`, just wrapped in an interactive loop.

---

## 4. Execution Profiles & Task Scope

Profiles (`ExecutionProfile`) live in `src/agent/profiles.ts` and are threaded via `runProfile` in state.

### 4.1. Profiles

- `strict`  
  - Production‑like verification (tests + build + lint/syntax) where feasible.  
  - Higher command/test limits, but strict stop rules.
- `fast`  
  - Normal dev loop. One good diagnostic command (build/test) plus critical checks.  
  - Partial success (`done_partial`) is allowed if the feature works and remaining failures are non‑critical.
- `smoke`  
  - Lightweight “does it basically run?” mode. A few quick commands, minimal tests.  
  - Intended for tiny changes and sanity checks.
- `yolo`  
  - Aggressive mode. Aim is to get a functional result as quickly as possible.  
  - Still respects SDD, diffs, and safety, but tolerates more leftover test noise.

### 4.2. Task Scope

`TaskScope` is defined in `src/agent/task_scope.ts` and stored in `state.taskScope`:

- `tiny` — micro‑changes (typos, copy tweaks, small config).  
  Coder is allowed to skip heavy commands when they would clearly be overkill.
- `normal` — typical tasks (a few files, a couple of tests).
- `large` — larger changes / refactors; allows more research steps and commands.

Profile + scope drive budgets (`BudgetState` in `state`) and how many commands/tests/web requests can be consumed before stop rules kick in.

---

## 5. SDD: project “brain”

SDD artifacts live under `.sdd/`:

- `project.md` — project description, goals, Definition of Done.
- `architect.md` — architecture spec and standards.
- `best_practices.md` — researched best practices and stack guides.
- `backlog/tickets/{open,closed}/NN-some-slug.md` — tickets (see template in `src/agent/prompts/brain/ticket_template.md`).
- `runs/` — run reports.
- `issues.md` — blockers recorded by Snitch as structured entries.

### 5.1. SDD bootstrap

If `.sdd/` is missing and you call `--goal`:

1. **sdd_research** — gathers context for stack/domain (web search + templates).  
2. **sdd_architect** — generates `project.md` + `architect.md` + `best_practices.md` from templates in `src/agent/prompts/brain/`.  
3. **sdd_tickets** — creates an initial backlog (`NN-some-ticket.md`).

After that, the main graph (`planner → researcher → coder → verifier → snitch`) runs under the rules defined in `.sdd/*`.

---

## 6. LangGraph Architecture

The main graph is assembled in `src/agent/graph.ts` and uses `AgentState` (`src/agent/state.ts`).

### 6.1. State (simplified)

Key fields:

- `messages` — chat history (including tool calls).
- `sdd` — loaded SDD texts (project/architect/best_practices/ticket).
- `plan` — planner decision (next, reason, plan[], needs).
- `researchResults` / `researchQuality` — web research results and quality.
- `fileChanges` — which files were changed.
- `testResults` / `detectedCommands` — what was run and how it failed/passed.
- `functionalChecks` — functional probes (build/test/dev commands and their outcome).
- `budget` — limits and actual usage for commands/tests/web requests.
- `loopCounters`, `totalSteps`, `consecutiveNoOps`, `sameErrorCount` — loop‑detection and progress‑tracking fields.

### 6.2. Nodes

- `planner` (`src/agent/nodes/planner.ts`)  
  Takes goal + SDD + previous results and decides:
  - where to go next (`next`),
  - a small action plan (`plan[]`),
  - what is needed (research queries, files, tests).
  It uses `loopCounters`, `FUNCTIONAL_OK`, budgets and profiles.

- `researcher` (`src/agent/nodes/researcher.ts`)  
  Plans/executes web search (shallow vs deep), enforces injection‑safety and cost, returns findings + quality.

- `coder` (`src/agent/nodes/coder.ts`)  
  Pure tools‑agent:
  - `read_file`, `list_files`, `write_file`, `write_patch`, `apply_edits`,  
  - `run_command`, `run_tests`, `run_diagnostic`.  
  Error‑first (diagnostic), diff‑first (minimal unified diffs), budget‑aware, with patch‑loop prevention.

- `verifier` (`src/agent/nodes/verifier.ts`)  
  Detects stack/commands (`detectCommands`), runs checks (syntax → tests/build), records results and functional probes, decides `done` vs `planner`, and sets `done_success` vs `done_partial`.

- `snitch` / ticket closer  
  Writes blockers to `.sdd/issues.md`, closes tickets, and augments the run report.

---

## 7. Prompts: brain vs body

Prompts are split into:

- **Body (runtime):** `src/agent/prompts/body/`  
  - `meta_agent.md` — main system prompt.  
  - `planner.md` — JSON decisions, loop‑aware, profile‑aware.  
  - `researcher.md` + helpers (`research_query_refiner`, `research_relevance_evaluator`, `search_query_optimizer`).  
  - `coder.md` — tools policy, error‑first, diff‑first, JSON‑only.  
  - `verifier.md` — goal‑first DoD, partial success, JSON‑only.

- **Brain (SDD templates):** `src/agent/prompts/brain/`  
  - `research_template*.md`, `architect_template.md`, `agent_template.md`, `ticket_template.md`, etc.

Prompt contracts are covered by tests:

- `test/core/prompts.test.ts`
- `test/agent/prompt_contracts.test.ts`

---

## 8. Budgets, Stop Rules & Safety

### 8.1. Budgets

`BudgetState` lives in `state.budget` and is initialized in `plannerNode` based on profile and scope:

- limits for:
  - commands (`run_command` / `run_tests`),
  - web requests,
  - test runs.
- when a budget is exhausted:
  - Planner may choose `done_partial` (if the functional goal is met), or
  - terminate the run as `aborted_stuck` via Snitch.

### 8.2. Stop rules

Anti‑loops and progress supervision use:

- `loopCounters` (planner→researcher/verifier/coder),
- `consecutiveNoOps` (coder with no changes),
- `sameErrorCount` + `lastTestSignature` (same failure repeating),
- `totalSteps` / `MAX_STEPS`.

Behaviour is defined in `.sdd/architect.md` (Stop Rules & Loops) and Ticket `35-supervisor-level-progress-controller-and-stuck-handler.md`.

### 8.3. Safety

- FS tools (`src/tools/fs.ts`) use `resolvePath` and prevent escaping `rootDir`.  
- Patches are validated for:
  - absence of markdown fences and `<tool_call>` (Ticket 26),  
  - valid unified diff structure.
- Web search respects allowlists/robots.txt (see `.sdd/best_practices.md` and `src/tools/web_search.ts` / `deep_research.ts`).

---

## 9. Typical Run Lifecycle

1. CLI builds `KotefConfig` and loads/bootstraps `.sdd/`.
2. `AgentState` is constructed (goal, ticket, SDD, scope, profile, summaries).
3. `buildKotefGraph(cfg)` creates the LangGraph (planner → researcher → coder → verifier → snitch).
4. The graph runs until:
   - `done_success`,
   - `done_partial`,
   - or `aborted_*` (loops, budgets, conflicts).
5. A run report is written to `.sdd/runs/` and, if needed, `issues.md`.

---

## 10. Where to hack

- **CLI & config:** `src/cli.ts`, `src/core/config.ts`  
- **Graph & nodes:** `src/agent/graph.ts`, `src/agent/nodes/*.ts`, `src/agent/state.ts`  
- **Tools:** `src/tools/*`  
- **Prompts:** `src/agent/prompts/{body,brain}/*`  
- **SDD driver:** `src/sdd/template_driver.ts`  
- **Tests:** `test/agent/*`, `test/tools/*`, `test/core/*`, `test/sdd/*`

When in doubt, read `.sdd/architect.md` and `.sdd/best_practices.md`: they are the law for architecture and quality.
