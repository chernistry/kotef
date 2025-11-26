You are a specialized web‑research agent focused on modern software engineering and senior/staff‑level development practices. You have Internet access and can find, compare, and synthesize information from the best recent sources (roughly 2020–2025).

Important: you do NOT have access to our local repository, code, or filesystem. Everything you know about our coding agent and project comes only from this prompt. Do not attempt to read files or inspect directories; reason purely from the description below and from web research.

---

Context: what our agent “Kotef” is (conceptually)

We have an existing spec‑driven coding agent called Kotef:

- It is built as a LangGraph graph of nodes (states/roles).
- It has two conceptual layers:
  - The “brain”:
    - A project specification, an architecture specification, and a best‑practices document.
    - A backlog of tickets describing work items.
    - Together these documents form a source of truth for goals, constraints, standards, and a Definition of Done (DoD).
  - The “body”:
    - Tools that read/write files and apply patches.
    - Tools that run commands (build, test, lint, etc.).
    - Tools that run tests.
    - LSP diagnostics for code errors.
    - Web search and deep research tools.
    - Optional integration with external tools (e.g., via MCP).
- The main working graph of nodes (simplified) includes:
  - bootstrap – initializes the “brain” specs when first run.
  - planner – decides what to do next based on the goal and current state; chooses the next node (researcher/coder/verifier/snitch/done).
  - researcher – performs web search and deep research, returns structured findings and risks.
  - coder – applies minimal, safe diffs to the project according to specs, plan, and research.
  - verifier – runs tests/diagnostics and records whether the functional goal is met.
  - snitch / ticket_closer – logs issues, creates/updates tickets, and closes finished tickets.
- Currently implemented behaviors (conceptually) include:
  - Deep research:
    - Multi‑step web search with query optimization.
    - Quality scoring (relevance, confidence, coverage).
    - Query refinement and selection of the best attempt.
  - Researcher node:
    - Plans and executes search queries.
    - Returns JSON with a list of queries, synthesized findings, risks, and a “ready_for_coder” flag.
  - Planner node:
    - Manages budgets (limits on commands, test runs, web requests).
    - Uses a progress controller and state history to detect loops and stuck states.
    - Considers research quality and functional probes.
    - Chooses the next node: researcher / coder / verifier / snitch / done.
  - Coder node:
    - “Diagnostics‑first”: looks at build/test/type errors first and tries to fix them before adding new changes.
    - Uses execution profiles (`strict`, `fast`, `smoke`, `yolo`) and task scopes (`tiny`, `normal`, `large`).
    - Prefers minimal, safe diffs instead of large rewrites.
    - Uses semantic code search to find relevant files/symbols.
    - Enforces budgets to avoid over‑using heavy commands.
  - Architectural “brain templates”:
    - Text templates for project spec, architecture spec, and best practices.
    - They already encode principles like:
      - Clarity first (plan + checkable reasoning before code).
      - MVP focus (minimal‑sufficient solution + scale‑up path).
      - Verification (tests and validation are first‑class).
      - Security / Reliability / Cost/Latency as key axes.
      - Explicit Definition of Done linked to tickets.

Problem: despite all this, the agent still behaves more like a “smart junior” than a real senior/staff engineer. It often lacks:

- Systemic / architectural thinking.
- Long‑term evolution thinking and technical‑debt management.
- Sophisticated risk management and metrics‑driven decisions.
- Mature engineering discipline: simplification, scope control, saying “no” when appropriate.

We want to upgrade the agent so that its behavior is much closer to a strong senior/staff engineer.

---

Your task

1. Using up‑to‑date sources (roughly 2020–2025), find and synthesize the most promising and modern approaches to software development and engineering practice that:
   - Accelerate feature delivery and iteration.
   - Increase quality, reliability, and predictability.
   - Encourage justified decision‑making and explicit trade‑offs.
   - Are supported by real‑world practice (large companies, well‑known engineers, empirical studies, DORA research, etc.).
2. Based on this, design a practical “full‑cycle workflow algorithm” for a coding agent that:
   - Is compatible with the architecture described above (planner/researcher/coder/verifier/snitch + brain documents and tickets).
   - Behaves like a strong senior/staff engineer rather than a junior.
   - Is broken down into steps/states/heuristics such that we can implement it as:
     - Prompts for the different nodes.
     - Transition rules in the graph.
     - Updates to brain documents (specs, best practices, tickets, ADRs).
     - Signals for progress‑control and budgets.
3. Explicitly identify which senior/staff capabilities are typically missing in LLM‑based coding agents (and likely in Kotef) and propose how to operationalize them inside such an agent.

---

Research requirements

Base your work on:

- Modern processes and frameworks:
  - Shape Up, Continuous Delivery/Deployment, trunk‑based development.
  - Dual‑track agile, continuous discovery, DevEx/SPACE/DORA.
  - Socio‑technical systems, Team Topologies, Conway’s law.
- Engineering practices:
  - TDD/ATDD, property‑based testing, contract testing.
  - Feature flags, blue‑green/canary, observability‑driven development.
  - Error budgets, SLO/SLA thinking.
- Architecture and design:
  - Domain‑Driven Design (DDD).
  - Modular monolith, hexagonal/clean architecture, evolutionary architecture.
  - Architecture Decision Records (ADR), RFC/design review processes.
- Individual engineer practice:
  - Systems thinking and technical strategy.
  - Explicit trade‑off thinking (speed vs quality, DX vs UX, local vs long‑term).
  - Technical‑debt and risk management.
  - Using git history to understand hot spots, evolution, and hidden invariants.
- AI‑assisted / agentic development:
  - Multi‑agent patterns (planner/researcher/coder/verifier).
  - Safety/guardrails, budgeted decision‑making, loop detection.
  - Best practices for integrating LLMs into dev workflows (Copilot‑like tools, internal tooling at large companies).

For each approach or idea you surface:

- Briefly explain:
  - Its core idea.
  - Which problems it solves.
  - Which sources/authors or organizations support it (names of books, articles, companies, or engineers are enough).
- Explain how it could be embedded into our agent:
  - Which artifacts need to exist or be updated (specs, ADRs, tickets, metrics).
  - Which signals/data the agent should look at (errors, git history, test coverage, complexity, risks).
  - Which decisions and heuristics the agent should apply (when to refactor, when to cut scope, when to create a new ticket instead of doing more changes now).

---

Main deliverable:
FULL‑CYCLE ALGORITHM FOR A CODING AGENT (KOTEF‑COMPATIBLE)

Create a dedicated section in your answer titled:

FULL-CYCLE ALGORITHM FOR A CODING AGENT (KOTEF-COMPATIBLE)

This algorithm must be realistic to implement and map cleanly to the described architecture.

Algorithm structure:

Break the full cycle into major phases (numbered), for example:

1. Understand goal and context (goal + existing specs).
2. Analyze the current system state (code, architecture, tests, historical issues).
3. Design/architecture and decision‑making (trade‑offs, ADR).
4. Plan the work and choose a strategy (profiles, budgets).
5. Implementation (minimal diffs, working with existing code).
6. Testing, diagnostics, and functional verification.
7. Refactoring and technical‑debt management.
8. Documentation and “brain” updates (architecture, best practices, tickets, ADRs).
9. Integration/deploy readiness (contracts, configs, commands).
10. Retrospective and agent learning (how prompts/process should evolve).

For each phase, describe:

- Phase goal: what it must achieve.
- Inputs: what information is available to the agent conceptually (goal, specs, prior results, errors, history).
- Outputs: which artifacts and signals should be updated or produced (updated plan, ADR decision, new/closed tickets, updated specs, test results, metrics).
- Concrete agent actions (checklist):
  - What it should “read/consider” (descriptions, architecture, best practices, goals, errors).
  - Which clarifying questions it should logically raise (even if our current UIs are simple logs/TUI).
  - Which commands/checks it should run.
  - How it should break work into tickets/sub‑steps.
  - How it should record decisions (ADR entries, architectural sections, tech‑debt tickets).
- Senior/staff heuristics:
  - How to account for long‑term evolution.
  - How to think “through risk” (which risk does this step reduce or create?).
  - How to choose minimally sufficient changes.
  - When to mark status as partial/blocked instead of trying forever.
- Phase exit criteria: clear “done” conditions (e.g., ADR recorded; spec updated; functional goal verified; risks and debts recorded).

Ensure the algorithm includes explicit sub‑phases/steps for:

- Working with existing architecture and specs:
  - Reading and updating the architecture spec and project spec.
  - Recording architectural decisions as ADR‑style entries or sections.
- Analyzing git history and evolution (conceptually):
  - How a future git‑aware version of the agent could use history to find hot spots and fragile areas.
- Managing assumptions:
  - How to record them explicitly, and how to distinguish tentative hypotheses from hard constraints.
- Managing risks and technical debt:
  - How to decide “fix now” vs “create a separate tech‑debt ticket”.
  - Which types of risks must always be written down (security, compatibility, migrations, performance, operational risks).

At the end of the algorithm section, add a structured, machine‑readable description of phases that we can later map to graph nodes. This can be JSON‑like text, for example:

PHASES = [
  {
    "id": "understand_goal",
    "mapped_nodes": ["planner", "bootstrap"],
    "goal": "Understand the goal, tie it to existing specs and Definition of Done",
    "inputs": ["user_goal", "project_spec", "architect_spec", "best_practices", "tickets"],
    "outputs": ["clarified_goal", "updated_project_spec", "new_or_updated_tickets"],
    "actions": ["..."],
    "entry_signals": ["new_goal_received"],
    "exit_conditions": ["goal_is_unambiguous", "DoD_criteria_identified"],
    "senior_heuristics": ["..."],
    "metrics": ["ambiguity_level", "scope_risk"]
  },
  ...
]

This is a structural description, not executable code. It should be detailed enough that we can later implement it as prompts and graph transitions.

---

Separate section:
WHAT JUNIOR-LEVEL AGENTS USUALLY MISS AND HOW TO FIX IT (KOTEF EXAMPLE)

Create a section titled:

WHAT JUNIOR-LEVEL AGENTS USUALLY MISS AND HOW TO FIX IT (KOTEF EXAMPLE)

Focus on realistic gaps in typical LLM agents and “junior thinking”:

- List key senior/staff capabilities that agents typically lack:
  - System/architecture thinking.
  - Cost/constraint awareness (cost of change, latency, DX, UX).
  - Ability to simplify and reduce scope.
  - Habit of recording decisions and assumptions (ADRs, spec updates).
  - Working with metrics and signals (DORA/SPACE, DevEx, observability).
  - Careful use of research (not trusting the first link, looking for conflicts, tracking freshness/relevance of sources).
  - Ability to stop and say “partial/blocked” with a concrete rationale.
- For each capability:
  - Explain what it is.
  - Propose how to operationalize it in a Kotef‑style agent:
    - New stages/steps in the algorithm.
    - New rules/heuristics in planner/researcher/coder/verifier.
    - Extensions to the “brain” specs (mandatory ADR sections, metrics, risk registers).
    - Additional signals/metrics for the progress controller and decision‑making.

---

Answer format

- Language: English.
- Structure:
  1) A concise but dense overview of key modern approaches and ideas (1–2 pages).
  2) The main section FULL-CYCLE ALGORITHM FOR A CODING AGENT (KOTEF-COMPATIBLE).
  3) The section WHAT JUNIOR-LEVEL AGENTS USUALLY MISS AND HOW TO FIX IT (KOTEF EXAMPLE).
  4) A short list of names/terms/books/articles/organizations to look up for further reading (keywords only, no long annotations).

Write with enough detail and structure that we can realistically refactor prompts, the graph, and “brain” templates of a Kotef‑like agent to behave much closer to a strong senior/staff engineer, not a junior.

