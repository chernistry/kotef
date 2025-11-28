I will not repeat the full previous report. Below is an update that:

* Brings in more agents (RooCode, Cursor, Windsurf/Antigravity, Gemini, Qwen-Agent, OpenHands, Claude Code).
* Focuses on what is *new* or *clarified* for 2025.
* Ends with a growth strategy for kotef (how to make it a “real product”, not just an internal experiment).

---

## 0. Updated 2025 landscape: what the leading agents are actually doing

Very short scan, focused on patterns relevant to kotef:

* **Cursor**

  * Deep background codebase indexing with embeddings + semantic search; maintains a “Context Bench” eval and shows ~12–13% accuracy uplift when semantic search is available vs not. ([Cursor][1])
  * Indexes codebase asynchronously and uses vector search to retrieve relevant code snippets for both chat and completions. ([Cursor][1])

* **Claude Code (CLI + IDE plugin)**

  * Designed explicitly as an **agentic coding CLI**, not just chat. ([Anthropic][2])
  * Uses `CLAUDE.md` files as persistent project brain: repo structure, conventions, workflows, “do/do-not” rules, updated over time. ([Claude][3])

* **RooCode**

  * “Dev team of AI agents in your editor”; uses separate **Architect / Code / Orchestrator** roles, with multi-step workflows that can operate on FS, terminal, browser, and external tools. ([Roo Code][4])
  * Explicitly more expensive (frontier models, full FS/terminal) and marketed as “no dumbed-down assistant” – raw capability plus orchestration. ([Roo Code Docs][5])

* **Windsurf & Antigravity (Google)**

  * Windsurf is an **agent-native IDE** with Cascade (agent that can build full apps), AI terminal, and tight editor / browser / terminal integration. ([Windsurf][6])
  * Google’s **Antigravity** is an “agent-first coding platform” on Gemini 3 Pro; multiple agents can act in editor, terminal, browser; key concept: **Artifacts** (task lists, plans, screenshots, recordings) as explicit outputs of agent runs for transparency and verification. ([Google Antigravity][7])

* **Gemini Code Assist + Gemini CLI**

  * End-to-end assistance across lifecycle (build, deploy, operate), multi-IDE integrations, generous free quota; “agent mode” acts as a pair-programmer that can run multi-step tasks in IDE. ([Google for Developers][8])

* **Qwen-Agent**

  * Full agent framework around Qwen models with **planning, tool use, memory and MCP support**; ships with code-interpreter, browser, RAG, Chrome extension, etc. ([GitHub][9])

* **OpenHands**

  * Open-source, model-agnostic **platform for cloud coding agents** with an SDK; focuses on sandboxing, shell session management, execution feedback, and scaling to thousands of agents. ([OpenHands][10])

Across these tools, some clear patterns:

1. **Dedicated project config / memory file** (CLAUDE.md, Antigravity artifacts, Gemini project context, OpenHands configs).
2. **Serious codebase indexing** (semantic + structural search, incremental updates).
3. **Workflow-style orchestration** (Architect → Coder → Tester/Evaluator, multi-step).
4. **Artifacts & evals** (Cursor Context Bench, Antigravity artifacts, RooCode’s architect/orchestrator view).
5. **Platform-ization**: Qwen-Agent/OpenHands are frameworks for building agents; Antigravity/Gemini CLI act as agent hosts.

Kotef is basically a thin, CLI-first version of “Claude Code + CLAUDE.md + SWE-agent style evals + RooCode-style orchestrator”, but with SDD as the brain.

---

## 1. Repo / Codebase Understanding – updated best practices

### What is clearer in 2025

1. **Semantic search is no longer optional**
   Cursor’s own evals (“Cursor Context Bench”) show that adding semantic search to codebase tools improves retrieval accuracy by ~12.5 percentage points across multiple models. ([Cursor][11])

2. **Hybrid index is standard**
   Most serious tools are combining:

   * **Symbol/AST/LSP index** for precise references (where a function is defined, call sites, etc.).
   * **Embedding index** for fuzzy natural language queries. ([Cursor][1])

3. **Persistent project metadata files**

   * `CLAUDE.md` describes project structure, dependencies, conventions and “danger zones”, and Claude Code always loads it. ([Claude][3])
   * Antigravity’s artifacts and workspace configs play a similar role for multi-agent runs. ([The Verge][12])

4. **Autonomous onboarding flows**
   Claude Code supports “one-click codebase onboarding” – automatically scanning repo and creating high-level maps. ([Medium][13])

### Updated recommendations for kotef

You already have `project_summary` + ts-morph/tree-sitter. Concrete next steps:

1. **Add a minimal embeddings layer on top of the existing index**

   * Index *file-level and symbol-level snippets* with a small embedding model.
   * Provide a single tool: `search_code(query, k)` that returns a mixed list of `(file, symbol, snippet)` from BM25 + embeddings.

2. **Introduce `KOTEF.md` (your CLAUDE.md analog)**

   * Store in `.sdd/KOTEF.md` or `.kotef/config.md`.
   * Content:

     * Repo structure and “zones” (core, experimental, legacy).
     * Coding standards, test commands, deployment constraints.
     * “Never touch” areas and “high-risk” folders.
     * Short best-practices summary (the *human* version of `best_practices.md`).

   This becomes the **stable project brain** that both bootstrap SDD and runtime agent read, instead of spreading those rules across prompts and tickets.

3. **Make Planner *always* go via index**

   * No direct “guess” about files.
   * Planner must either call `search_code` or `code_map` before handing work to the coder, and its decision JSON should include a small list of target files / symbols.

---

## 2. Context Management & Drift – updated patterns

New things we learn from Claude Code, Cursor, Windsurf and Gemini:

1. **Persistent project files + local memory**

   * `CLAUDE.md` and similar project files allow persistent “project memory” without bloating chat history. ([Claude][3])
   * Gemini Code Assist stores organization context and integrates with Cloud tooling, but keeps agent runs relatively focused. ([Google for Developers][8])

2. **Context is curated, not blindly appended**

   * Windsurf’s agentic UX emphasizes explicit context surfaces (editor, AI terminal, browser) instead of streaming every log line into the model. ([Windsurf][6])
   * Cursor explicitly separates “codebase index” from conversation history, and runs retrieval per query. ([Cursor][1])

3. **Artifacts as context**

   * Antigravity’s Artifacts (task lists, plans, screenshots, browser captures) are a structured form of context for both humans and agents. ([The Verge][12])

### Updated recommendations for kotef

You already planned a ContextBuilder. I would:

1. **Represent “context units” as first-class objects**

   * `ContextUnit = { kind: "goal" | "summary" | "research" | "tests" | "index_hits" | "artifact"; body: string; source: string; }`.
   * Each node asks ContextBuilder for specific `kinds` (e.g. coder: `goal + ticket + index_hits + lastFailureSummary`).

2. **Add “Artifacts” explicitly to AgentState**

   * E.g. `artifacts: { type: 'plan' | 'diagram' | 'risk_log' | 'run_report'; content: string; createdAt: string }[]`.
   * Planner / Verifier / Retrospective nodes write artifacts that later runs can reuse without re-parsing full logs. This is your Antigravity-style trace.

3. **Use `KOTEF.md` as a high-level, stable context source**

   * ContextBuilder always loads it (and maybe the SDD summary) and injects a *short* distilled version rather than re-summarizing `project.md/architect.md` each time.

---

## 3. Prompt Architecture – learning from RooCode, Claude Code, Qwen-Agent

Key upgrades:

1. **Architect vs Coder vs Orchestrator as separate roles**

   * RooCode: explicitly has Architect, Code and Orchestrator agents. Architect handles design/planning; Code does localized edits; Orchestrator routes tasks and manages multi-step workflows. ([Roo Code][4])
   * OpenHands: SDK defines agents in code and composes them as workflows. ([OpenHands][10])

2. **Config files guiding prompts**

   * Claude Code: `CLAUDE.md` acts as a persistent system prompt extension. ([Claude][3])

3. **Framework-level patterns**

   * Qwen-Agent docs explicitly talk about instruction-following, planning, tool usage and memory as distinct layers in the framework. ([Qwen][14])

### Updated recommendations for kotef

You already have Planner / Researcher / Coder / Verifier. Tighten as:

1. **Rename roles to match mental model**

   * Planner → **Architect** (makes plans, designs steps).
   * Researcher → **Researcher** (unchanged).
   * Coder → **Executor** (Kiro / others).
   * Verifier → **Evaluator**.

   This matches RooCode and Qwen-Agent vocabulary and makes it easier for others to grok the architecture.

2. **Make prompts parameterized by IntentContract + KOTEF.md**

   * All system prompts constructed from:

     * global boilerplate (safety/format);
     * `IntentContract` (goal + constraints + success criteria);
     * `KOTEF.md` distilled section (project rules);
     * node-specific instructions.

   * This turns `.sdd/prompts/*.md` into *templates*, not monoliths.

3. **Adopt an “Architect-first” flow for non-trivial tasks**

   * For tickets above “tiny”, force a first Architect call that outputs:

     ```json
     {
       "subtasks": [...],
       "target_files": [...],
       "risk_factors": [...],
       "test_plan": [...]
     }
     ```

   * Store this as an Artifact and feed to Coder + Verifier.

---

## 4. Orchestration Patterns – what Antigravity, Gemini CLI, OpenHands add

New bits:

1. **Agent Manager / Mission Control**

   * Antigravity separates Editor view (per-workspace) from Manager view (orchestrating multiple agents across workspaces). ([The Verge][12])
   * OpenHands uses an SDK to define agents and scale them across infra with Daytona handling sandboxing, shell sessions, etc. ([OpenHands][10])

2. **Agent Mode in existing IDEs/CLIs**

   * Gemini Code Assist agent mode runs as a pair programmer in IDEs. ([Google for Developers][15])
   * Gemini CLI acts as an open-source agent host with MCP, Google Search, etc. ([The Verge][16])

### Updated recommendations for kotef

You do not need a full “mission control”, but you can:

1. **Define kotef’s orchestration as a *LangGraph SDK* layer**

   * Make the graph definable in a small `graph.ts` config object.
   * That makes it easier later to embed kotef as:

     * a GitHub Action (Gemini CLI style);
     * an MCP server for IDEs;
     * or a sub-agent in Qwen/OpenHands.

2. **Keep your graph static but “agent-ready”**

   * Clear typed interfaces for each node; no hard-coded side effects.
   * This is important for integration with agent hosts like Gemini CLI or OpenHands later.

---

## 5. Constraint Following & Intent Preservation – reinforced by Claude Code & Antigravity

New explicit signals:

* Claude Code best-practice docs and user writeups emphasize using `CLAUDE.md` to define **boundaries, folder-level rules, codeowners and avoid-breaking-shared-code constraints**, and they report that this drastically reduces scope creep. ([DEV Community][17])
* Antigravity’s artifacts plus multi-agent logs are precisely there to address **security and trust concerns**, giving humans transparency into what agents did and why. ([The Indian Express][18])

### Updated recommendations for kotef

On top of the IntentContract you already planned:

1. **Add a simple “policy engine”**

   * A set of deterministic checks:

     * Changed files ⊆ allowed paths.
     * No modifications to forbidden files (from KOTEF.md).
     * No addition of prohibited dependencies.

   * If violation: rollback and set `terminalStatus = 'aborted_constraint'`.

2. **Constraint-aware ticket generation**

   * Before SDD Orchestrator generates `architect.md` and tickets, feed it the IntentContract + KOTEF.md so large “redesign everything” tickets are impossible when constraints say “only minimal refactor”.

3. **Store constraints in Artifacts**

   * First run of Intent Parser writes an Artifact `"type": "intent_contract"`.
   * Later runs reference that artifact even if the original CLI goal string is gone.

---

## 6. Verification / Quality Gates – what others do

New, concrete patterns:

* Claude Code docs and blogs showcase workflows where Claude maps a repo, makes a plan, applies changes, and then *summarizes diffs and test results*, often with human approval at the end. ([Anthropic][2])
* Windsurf’s Cascade and AI Terminal frequently run commands and show side-by-side previews as a visual verification gate. ([DataCamp][19])
* Gemini CLI GitHub Actions run on PRs and issues: they act asynchronously to label, prioritize, and suggest fixes/test changes, integrating into CI. ([TechRadar][20])
* OpenHands emphasizes sandboxed execution and feedback loops between environment and agent. ([OpenHands][10])

### Updated recommendations for kotef

In addition to what you already do:

1. **Explicit “Verification Artifact”**

   * Verifier outputs a structured artifact containing:

     * tests run + results,
     * summary of new vs pre-existing failures,
     * changed files and risk notes,
     * a one-line “ship / probably-ship / do-not-ship” verdict.

2. **GitHub / CI integration as an early growth channel**

   * Add a simple GitHub Action that runs kotef in `verification-only` mode on a PR:

     * Uses project’s SDD + KOTEF.md.
     * Runs tests/diff analysis and posts a comment with Verification Artifact.

   This is how Gemini CLI and Antigravity are starting to spread – as **CI or repo bots**, not only interactive tools. ([TechRadar][20])

---

## 7. External Coder Integration – lessons from RooCode, Gemini CLI, Qwen-Agent, OpenHands

Patterns:

* RooCode acts as an orchestrator within VS Code, but conceptually it is a **multi-agent runner** around whichever LLM you configure (via OpenRouter, etc.). ([Roo Code][4])
* Gemini CLI is an agent host that exposes MCP tools, search, etc., and can be scripted through GitHub Actions. ([The Verge][16])
* Qwen-Agent and OpenHands are *frameworks* – the core of the design is a typed, composable API for tools and agents. ([Qwen][14])

### Updated recommendations for kotef

1. **Normalize the executor boundary**

   Design an interface that is intentionally similar to OpenHands/Qwen tool definitions:

   ```ts
   // conceptual, not literal
   interface ExecutorRequest {
     intent: IntentContract;
     plan: ArchitectPlanArtifact;
     codeContext: CodeSnippet[];
   }

   interface ExecutorResult {
     changedFiles: string[];
     logs: string[];
     error?: string;
   }
   ```

   Then implement:

   * KiroExecutor now,
   * “Local LLM diff executor” later,
   * Potentially a “Gemini CLI executor” or “Claude Code executor” later (if they expose APIs you can drive).

2. **Think of kotef as a *brain* that can sit behind many executors**

   * From a growth perspective, your differentiation is “SDD brain + research + tickets + verification”, not “who edits the file”. That’s how OpenHands markets itself: platform for agents, not a single assistant. ([OpenHands][10])

---

## 8. Simplification vs Feature Completeness – evidence check

External evidence supports your instinct that solo devs should avoid multi-layer overengineering:

* Claude Code best practices and user writeups repeatedly say “start with a CLAUDE.md, a few workflows, then iterate based on what breaks / confuses you”; they *do not* recommend building many agents early. ([Anthropic][2])
* AtidCollege’s 2025 comparison of coding tools shows top performers like RooCode and Void, but they are still essentially *one product surface + well-tuned workflows*, not huge framework stacks. ([Atid College][21])

### Updated recommendations for kotef

Strongly:

1. **Cut before you add**

   * Keep: Intent parser, KOTEF.md, simple Code Map + embeddings, Architect → Executor → Evaluator pipeline, SDD as a project brain.
   * Defer: second-layer SDD Orchestrator deepResearch for every run, overly complex risk maps, too many node types.

2. **Pick *one surface* to polish first**

   Instead of trying to be both CLI + IDE + CI tool, pick one (see growth strategy below).

---

## 9. State Persistence / Learning – CLAUDE.md, Antigravity artifacts, project memory

We now have concrete external examples of how project memory is persisted:

* `CLAUDE.md` stored in repo and edited over time by humans and agents; includes structure and rules. ([Claude][3])
* Antigravity’s Artifacts are durable across runs and can be revisited in Manager view to guide later work. ([The Verge][12])

### Updated recommendations for kotef

1. **Treat `.sdd/` + `KOTEF.md` + `project_memory.json` as the entire “long-term memory”**

   * No need for a big vector memory store at this stage.
   * Focus on: project rules, known flaky tests, common commands, and “lessons learned” from retrospectives.

2. **Add a tiny retrospective-to-memory pipeline**

   * Retrospective node: emits 2–5 bullet-point lessons.
   * A simple script merges these into `project_memory.json` for reuse.

---

## 10. Open Source Agents as References – updated choices

Given new entrants:

* For **CLI / terminal style**: Claude Code, RooCode, Gemini CLI. ([Anthropic][2])
* For **framework patterns**: Qwen-Agent, OpenHands. ([Qwen][14])
* For **IDE-native UX**: Cursor, Windsurf, Antigravity, Gemini Code Assist. ([Cursor][1])

I would primarily copy from:

* **Claude Code + CLAUDE.md** for project brain + constraints.
* **RooCode** for Architect/Coder/Orchestrator split.
* **Cursor** for semantic indexing and evals.
* **OpenHands/Qwen-Agent** for SDK-style design of agents/tools.

---

## 11. How to actually grow kotef (not just architect it)

Now, the “product” part.

### 11.1 Positioning: what is kotef *for*?

Given the field, if kotef tries to be “another Cursor/Windsurf/RooCode inside VS Code”, it loses. Those are well-funded products.

A realistic wedge:

1. **“SDD Brain + Research Agent for your repo”**

   * Kotef’s differentiation:

     * Takes a vague goal and turns it into: best_practices, architect, tickets, risk notes.
     * Does **deep web research + architecture reasoning** up front.
     * Wraps execution in tests/verification and artifacts.

   * This is closer to:

     * “Claude Code but with persistent, explicit SDD artifacts.”
     * “An Architect + Tech Lead in a binary you can run in CI or locally.”

2. **Form factor**

   Pick one primary form first:

   * **CLI + GitHub Action** for now.
   * Later: MCP server used by IDE tools (Gemini CLI, Claude Code, RooCode, Windsurf) as an external architect/brain.

### 11.2 Growth strategy – 3 horizons

#### Horizon 0 (1–2 months): Hardening the core

Goal: make kotef solid as a CLI architect/agent for real projects.

Focus:

1. Implement:

   * Intent parser + IntentContract + KOTEF.md.
   * Minimal Code Map + embeddings + `search_code`.
   * ContextBuilder + Artifacts.
   * Executor interface + cleaned-up Kiro integration.

2. Build **5–10 small eval scenarios**:

   * A couple of TS/Node repos, a Python repo, maybe a mixed monorepo.
   * For each: a “goal → expected diff/tests” dataset.

3. Use evals the same way Cursor does with Context Bench (just much smaller): measure pass rates as you tweak prompts/flows. ([Cursor][11])

Output: kotef works reliably for you on your own projects; you trust it.

#### Horizon 1 (2–4 months): “Publicly useful” open-source tool

Goal: something people can actually adopt and contribute to.

1. **Stabilize a CLI UX**

   * `kotef init` – creates `.sdd/`, `KOTEF.md`, maybe baseline tickets.
   * `kotef plan` – updates tickets/architect.
   * `kotef run --ticket X` – runs Architect → Executor → Evaluator on a single ticket.
   * `kotef verify` – runs just verification on current diff and outputs Artifact.

2. **Add a GitHub Action**

   * `kotef-verify` action for pull requests:

     * Reads `.sdd` + `KOTEF.md`.
     * Runs tests/build as configured.
     * Posts a summary comment (Verification Artifact).

3. **Write clear docs for contributors**

   * “How the graph works” (short),
   * “How to add a node”,
   * “How to plug a new executor”.

This is exactly what RooCode and OpenHands do well: a visible surface + clear contributor story. ([Roo Code Docs][5])

#### Horizon 2 (4–9 months): Ecosystem + integrations

Options; you likely pick 1–2:

1. **MCP / Agent host integration**

   * Make kotef an MCP server exposing tools like `sdd_plan`, `sdd_verify`, `deep_research`.
   * Then users of Gemini CLI, Claude Code, RooCode, Windsurf can call kotef as their “Architect/Research brain” instead of re-implementing SDD. ([The Verge][16])

2. **Minimal VS Code extension**

   * Very thin: just buttons to invoke `kotef run` / `kotef verify` and show Artifacts in a panel.
   * You do **not** re-implement Cursor; you just surface kotef’s decisions and tickets.

3. **Hosted mode / SaaS later**

   * Once CLI is mature and people use it, a small hosted service that:

     * runs evals on PRs,
     * caches research,
     * offers heavier compute (bigger models) than local.

### 11.3 How to make contributors want to help

Borrow from RooCode / OpenHands:

1. **Be model-agnostic / executor-agnostic**

   * Show that people can plug in their own executors (local LLM, Qwen, Gemini CLI, Claude Code). ([GitHub][9])

2. **Document “Why kotef exists”**

   * Position as: “If you already use Cursor/Windsurf/RooCode, kotef gives you a *brain* and SDD layer they don’t – architecture, research, tickets, verification – that you can run in CI or via MCP.”

3. **Low-friction contributions**

   * Label a small set of “good first issues”:

     * add support for another language in Code Map,
     * add another runProfile,
     * improve a single prompt with tests.

4. **Showcase Artifacts**

   * Like Antigravity, expose nice run reports and plans; this is what people will screenshot and share in posts. ([The Verge][12])

---

## 12. Condensed priority list (delta vs previous report)

P0 (do first):

1. `IntentContract` + Intent parser + `KOTEF.md` config file.
2. Minimal Code Map + embeddings + `search_code`.
3. ContextBuilder + Artifacts (plans, verification, intent).
4. Clean Executor interface around Kiro (and future executors).

P1:

5. CLI UX (`init`, `plan`, `run`, `verify`) + small eval suite.
6. GitHub Action for `kotef verify`.
7. Simplify SDD orchestrator: fewer prompts, constraints-aware.

P2:

8. MCP server / agent-host integration.
9. VS Code extension as a thin shell.
10. More advanced indexing and multi-language support.

If you want, next step I can draft:

* exact `KOTEF.md` template,
* TypeScript interfaces for Code Map / Artifacts / Executor,
* and a concrete “P0” issue list you can paste into `.sdd/backlog`.

[1]: https://cursor.com/docs/context/codebase-indexing "Codebase Indexing | Cursor Docs"
[2]: https://www.anthropic.com/engineering/claude-code-best-practices "Claude Code: Best practices for agentic coding"
[3]: https://www.claude.com/blog/using-claude-md-files "Customizing Claude Code for your codebase"
[4]: https://roocode.com/ "Roo Code – The AI dev team that gets things done"
[5]: https://docs.roocode.com/ "Roo Code Docs | Roo Code Documentation"
[6]: https://windsurf.com/editor "Windsurf Editor"
[7]: https://antigravity.google/ "Google Antigravity"
[8]: https://developers.google.com/gemini-code-assist/docs/overview "Gemini Code Assist overview"
[9]: https://github.com/QwenLM/Qwen-Agent "QwenLM/Qwen-Agent"
[10]: https://openhands.dev/ "OpenHands | The Open Platform for Cloud Coding Agents"
[11]: https://cursor.com/blog/semsearch "Improving agent with semantic search"
[12]: https://www.theverge.com/news/822833/google-antigravity-ide-coding-agent-gemini-3-pro "Google Antigravity is an 'agent-first' coding tool built for Gemini 3"
[13]: https://xtawfik.medium.com/10-claude-code-power-ups-you-probably-didnt-know-you-had-and-how-to-use-them-6d55feeb8c13 "10 Claude Code Power-Ups You Probably Didn't Know You ..."
[14]: https://qwen.readthedocs.io/en/latest/framework/qwen_agent.html "Qwen-Agent - Read the Docs"
[15]: https://developers.google.com/gemini-code-assist/docs/use-agentic-chat-pair-programmer "Use the Gemini Code Assist agent mode"
[16]: https://www.theverge.com/news/692517/google-gemini-cli-ai-agent-dev-terminal "Google is bringing Gemini CLI to developers' terminals"
[17]: https://dev.to/ujjavala/a-week-with-claude-code-lessons-surprises-and-smarter-workflows-23ip "A week with Claude Code: lessons, surprises and smarter ..."
[18]: https://indianexpress.com/article/technology/artificial-intelligence/what-is-antigravity-google-ai-coding-platform-security-concerns-10389776/ "What is Antigravity, Google’s new agentic AI coding platform raising fresh security concerns?"
[19]: https://www.datacamp.com/tutorial/windsurf-ai-agentic-code-editor "Windsurf AI Agentic Code Editor: Features, Setup, and Use ..."
[20]: https://www.techradar.com/pro/google-gemini-and-github-are-teaming-up-for-ai-powered-coding "Google Gemini and GitHub are teaming up for AI-powered coding"
[21]: https://atidcollege.co.il/ai-coding-assistance/ "מבחן ההשוואה הגדול: AI Coding Assistance"
