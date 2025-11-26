# Deep Search & Ticket Flow – Design Note

Context: internal architecture/design note for kotef itself. Scope is limited to:
- deep web search / deep research behaviour;
- ticket lifecycle (open → closed, ticket requirements vs task size).

Reference deep search algorithm: `allthedocs/learning/research/web_search/algorhytm.md`.

---

## 1. Current Deep Search Behaviour in kotef

Code paths:
- `src/tools/web_search.ts`
  - Wrapper over Tavily `search` with:
    - `max_results` param (default 5);
    - hard-coded `search_depth: "basic"` (no notion of depth per task);
    - simple allow/block-lists for hosts.
- `src/tools/fetch_page.ts`
  - Fetches HTML + extracts text for a single URL.
- `src/tools/deep_research.ts`
  - Core deep-research loop:
    - Optional query optimisation via `search_query_optimizer` prompt.
    - Loop up to `maxAttempts` (default 3):
      1. `webSearch(query, { maxResults: 5 })`.
      2. Fetch top 3 pages via `fetchPage` (fallback to snippet on failure).
      3. Summarise into `DeepResearchFinding[]` via `summarizeFindings` (LLM JSON).
      4. Score with `research_relevance_evaluator` (LLM JSON) → `ResearchQuality` (relevance, confidence, coverage, shouldRetry, reasons).
      5. If quality ≥ thresholds (relevance ≥ 0.7, coverage ≥ 0.6) → stop.
      6. Else, optionally refine query via `research_query_refiner` and retry.
    - Picks best attempt by weighted score or max findings.
    - Returns `{ findings, quality: { lastQuery, relevance, confidence, coverage, attemptCount, shouldRetry, reasons } }`.
- `src/agent/nodes/researcher.ts`
  - Builds research plan via runtime `researcher` prompt:
    - Inputs: goal, ticket (if any), best_practices, planner `needs.research_queries`, execution profile, task scope.
    - Output JSON: `queries[]`, `findings[]`, `ready_for_coder`, etc.
  - Execution:
    - For `profile === "strict"`:
      - Runs a single `deepResearch` call **only for the first query**:
        - `deepResearch(cfg, primaryQuery, { originalGoal: state.sdd.goal, maxAttempts: 3 })`.
    - For other profiles (`fast`, `smoke`, `yolo`):
      - Runs **shallow** `webSearch` for each query with `maxResults: 3` and returns simple `{ summary, sources[], title }` objects.
  - Stores `researchResults` and `researchQuality` in state.
- `src/agent/prompts/body/*`
  - `researcher.md`:
    - Rough guidance:
      - `tiny + yolo`: minimal research.
      - `fast`: small number of focused queries.
      - `strict`: deep research with multiple sources and scoring.
    - No explicit notion of:
      - task type (reference / research / architecture / debug),
      - novelty / uncertainty thresholds,
      - adaptive breadth/depth beyond the execution profile.
  - `research_relevance_evaluator.md`, `research_query_refiner.md`, `search_query_optimizer.md`: JSON-only helpers used inside `deep_research.ts`.
- `src/agent/graphs/sdd_orchestrator.ts`
  - Uses `deepResearch(config, goal, { originalGoal: goal, maxAttempts: 3, techStackHint })` once to produce `best_practices.md` context.

Behaviour summary:
- Depth is essentially:
  - `strict` profile → one `deepResearch` loop with up to 3 attempts, 5 results/attempt, 3 pages/attempt.
  - other profiles → shallow search only (`webSearch`).
- There is **no** explicit modelling of:
  - research graph (questions, hypotheses, claims, conflicts);
  - task type / novelty / SDD-context-awareness as first-class controls;
  - adaptive breadth/number of iterations beyond `maxAttempts`.

---

## 2. Differences vs Reference Algorithm (algorhytm.md)

Reference algorithm key points (abridged):
- Represents research as a **graph**:
  - Nodes: questions, hypotheses, sources, claims, entities.
  - Edges: supports / contradicts / refines / cites / derived-from.
- Steps:
  1. Clarify main question & goal type.
  2. Decompose into sub-questions & hypotheses.
  3. Design search plan (priority queue of questions, source landscape).
  4. Wide search (breadth-first): multi-channel, deduplication, clustering, early scoring.
  5. Deep drill (depth-first): promote sources, segment content, extract claims.
  6. Cross-question reasoning: map claims to hypotheses, detect conflicts/gaps, triangulate.
  7. Iterative refinement loop with explicit stopping criteria:
     - diminishing returns on key scores,
     - coverage thresholds per top questions,
     - budget/time exhaustion with explicit residual uncertainty.
  8. Synthesis: structured answer + narrative + confidence & open questions.

Delta vs current kotef:
- No explicit **question decomposition**:
  - `researcher` prompt emits `queries[]` but not structured question/hypothesis graph.
- No explicit **research graph** data structure:
  - We only have `DeepResearchFinding[]` as flat statements with local citations.
- Limited **breadth vs depth control**:
  - Breadth: fixed `maxResults` (5) and `topResults` (3 pages).
  - Depth: fixed `maxAttempts` (default 3) and a single scoring gate.
  - No early-phase “wide map then drill” distinction.
- No explicit **task type / novelty / context awareness**:
  - TaskScope (`tiny` | `normal` | `large`) exists in `AgentState`, but is not fed into deep research.
  - SDD content (architect/best_practices) is not used to decide whether external research is needed or how deep to go.
- Stop criteria are implicit:
  - (quality ≥ thresholds) OR (attempts exhausted) OR (refiner says stop).
  - No notion of diminishing returns across multiple sub-questions.

---

## 3. Target Behaviour: Adaptive Deep Search

High-level goals:
- For **simple / obvious** tasks:
  - Avoid expensive deep research.
  - Prefer zero or shallow search with few results and at most one iteration.
- For **complex / research / architectural / planning** tasks:
  - Allow deeper search:
    - multiple attempts with refined queries,
    - more results and more pages per attempt,
    - “advanced” Tavily depth where appropriate.
- Make depth selection **explicit and inspectable**, based on:
  - task type: reference / implementation detail / architecture / debugging;
  - **TaskScope** (`tiny` / `normal` / `large`);
  - SDD context availability (project/architect/best_practices);
  - novelty/uncertainty (via `ResearchQuality` and topic presence in SDD).

### 3.1. Task Size Categories

Map business notion to existing `TaskScope`:
- **Small task** ⇔ `TaskScope = 'tiny'`
  - Usually ≤ 1–3 small steps or ≤ 1–3 micro-tickets.
  - Examples: typo fix, minor refactor in a single file, docs tweaks.
- **Medium task** ⇔ `TaskScope = 'normal'`
  - Non-trivial feature or bugfix, but bounded in 1–2 modules.
- **Large task** ⇔ `TaskScope = 'large'`
  - Architecturally significant changes, new subsystems, or cross-cutting refactors.

Heuristics (already implemented in `src/agent/task_scope.ts` and reused here):
- `tiny`: short goals with “tiny change” signals (typo, docs-only, rename, etc.).
- `large`: explicit architecture/platform keywords or long specs.
- `normal`: everything else.

### 3.2. Task Type Classification (Lightweight)

Add a lightweight classifier (heuristic, not LLM) inside `deep_research.ts` (or a small helper module) to categorise the main query/goal into:
- `reference`: “what is X”, “how to use Y”, simple API questions.
- `debug`: stack traces, errors, “Exception”, “Error”, “crash”.
- `architecture`: “design/architecture/best practices/patterns for …”.
- `research`: trade-offs, comparisons, exploratory questions (“vs”, “compare”, “pros/cons”, “tradeoffs”).

This classification plus `TaskScope` drives strategy selection (see §3.3).

### 3.3. Research Strategy Levels

Introduce an internal `ResearchStrategy` (non-exported type) with variants:
- `none`:
  - No web search; rely on SDD + repo context.
  - Applicable when:
    - `TaskScope = 'tiny'` AND question is obviously answerable from SDD/code, OR
    - Planner explicitly signals no research needed.
- `shallow`:
  - Single pass:
    - `maxAttempts = 1`;
    - `maxResults = 3`;
    - `topPages = 1–2`;
    - Tavily `search_depth: "basic"`.
  - Used for:
    - `TaskScope = 'tiny'` and non-tricky reference questions;
    - `TaskScope = 'normal'` with strong SDD coverage for the topic.
- `medium`:
  - 1–2 attempts:
    - `maxAttempts = 2`;
    - `maxResults ≈ 5`;
    - `topPages ≈ 3`;
    - `search_depth: "basic"`.
  - Used for the default case: `TaskScope = 'normal'` debugging / implementation / reference tasks where SDD is present but not complete.
- `deep`:
  - 3–5 attempts:
    - `maxAttempts ∈ [3,5]` (bounded by global budgets);
    - `maxResults ≈ 8–10`;
    - `topPages ≈ 5`;
    - `search_depth: "advanced"` where allowed.
  - Used for:
    - `TaskScope = 'large'`;
    - task type `architecture` or `research`;
    - low `ResearchQuality` from earlier attempts (low relevance/coverage).

Strategy selection inputs:
- `TaskScope` (from `AgentState.taskScope`).
- Task type (simple heuristics on `goal` / query).
- SDD context presence:
  - Rough check: if query/goal keywords appear often in `.sdd/architect.md` or `.sdd/best_practices.md`, bias toward `none` or `shallow`.
- Novelty / uncertainty:
  - `ResearchQuality` (relevance/coverage/confidence) from previous attempts.
  - If quality remains low and budgets allow, escalate `medium` → `deep` for critical questions.

### 3.4. Stopping Criteria

Extend/clarify stopping conditions in `deepResearch`:
- Primary gate (per attempt):
  - existing: `relevance >= 0.7 && coverage >= 0.6` → accept.
- Global gates:
  - `attempts >= maxAttempts` → stop.
  - Diminishing returns:
    - If last 2 attempts change relevance/coverage by < ε (e.g. 0.05) and no new high-confidence citations appear, stop early even if below target thresholds.
  - Budget constraints:
    - Respect global `BudgetState.maxWebRequests` in AgentState (when wired through).

Output remains the same (`DeepResearchResult`), but strategy/quality metadata will be richer and used by planner through `ResearchQuality`.

---

## 4. Deep Search Architecture Choice

Options:
- **A. Dedicated meta-agent for research graph**
  - Separate LangGraph subgraph to manage:
    - question decomposition;
    - prioritisation queue;
    - multi-channel search; 
    - explicit research graph (Questions/Hypotheses/Sources/Claims);
    - conflict resolution and triangulation.
  - Pros:
    - Clear separation of concerns; explicit graph data structure.
    - Easier to introspect and visualise research state.
  - Cons:
    - High token and latency cost (multiple nested LLM calls).
    - More moving parts to maintain and test.
    - Overkill for typical coding-oriented queries.

- **B. Specialised prompts and strategy layer on top of existing nodes (current direction)**
  - Keep single `researcher` node in the main agent graph.
  - Upgrade:
    - `deep_research.ts` to implement `ResearchStrategy` selection.
    - `researcher` prompt to incorporate task type/scope and SDD-provided context signals.
    - Use existing `ResearchQuality` as a proxy for uncertainty.
  - Pros:
    - Lower implementation overhead; reuses existing scaffolding.
    - Lower token/latency footprint.
    - Easy to tune heuristics and thresholds via config.
  - Cons:
    - No explicit research graph; reasoning remains implicit in prompts and findings.
    - Less reusable if we later want a generic research product.

**Chosen variant: B (strategy layer + prompt tuning on top of existing nodes).**

Rationale:
- kotef’s primary goal is **coding** with sufficient grounding, not a general-purpose research assistant.
- Existing implementation already uses a single researcher node and `deep_research.ts`.
- Strategy-level improvements (adaptive width/depth, better gating) get us most of the benefit with modest code changes and no graph explosion.
- Architect spec already assumes a single meta-agent with optional deep research tools; variant B aligns with that.

---

## 5. Ticket Flow: Current vs Target

### 5.1. Current Ticket Flow (Code Reality)

Code:
- Creation:
  - `src/agent/graphs/sdd_orchestrator.ts`:
    - `sddTickets` node calls LLM with `architectContent` + `ticket_template`, writes files to `.sdd/backlog/tickets/open/*.md`.
- Execution (CLI):
  - `src/cli.ts`:
    - `kotef run --ticket <id>`:
      - Loads `.sdd` files.
      - Finds ticket in `.sdd/backlog/tickets/open/` with prefix `<id>`.
      - Sets `state.sdd.ticket` + `state.sdd.ticketPath` and runs agent graph once.
    - `kotef chat`:
      - For each newly generated open ticket:
        - Builds initial state with `sdd.ticket` + `sdd.ticketPath`.
        - Invokes agent graph per ticket sequentially.
- Completion:
  - `src/agent/nodes/verifier.ts`:
    - LLM decides `{ next: "done" | "planner", terminalStatus? }` based on tests, diagnostics, profile, and ticket.
    - `done: decision.next === "done"`.
  - `src/agent/graph.ts`:
    - From `verifier`:
      - if `!state.done` → go back to `planner`.
      - if `state.done` and `state.sdd.ticketPath` is set → go to `ticket_closer`.
    - From `ticket_closer` → `END`.
  - `src/agent/nodes/ticket_closer.ts`:
    - Moves current ticket file:
      - from `.sdd/backlog/tickets/open/NN-slug.md`
      - to `.sdd/backlog/tickets/closed/NN-slug.md`
    - Updates `state.sdd.ticketPath` to closed path.
- Reporting:
  - `src/agent/run_report.ts`:
    - `RunSummary` has `ticketId`, `ticketPath`, `ticketStatus`, `followUpTickets?`.
    - Current callers (`cli.ts`) do **not** set these fields, so run reports never show ticket lifecycle explicitly.

Architect spec vs implementation:
- `.sdd/architect.md` §9.3 expects:
  - Planner to set `state.sdd.ticketPath`/`ticketId` when starting a ticket.
  - `ticket_closer` to move ticket on completion.
  - Run reports to reflect `ticketStatus`.
- In practice:
  - CLI is responsible for selecting a ticket and seeding `ticketPath`.
  - Tickets are moved to `closed/` only when:
    - Verifier sets `done = true`, and
    - `ticketPath` is non-empty.
  - Run reports do not yet expose ticket IDs/paths/status, so progress is hard to see.

### 5.2. Observed Problems

From requirements:
- Agent can create tickets in `backlog/tickets/open`, but:
  - Tickets are not visibly moved to `backlog/tickets/closed` after completion (no explicit status in reports / tooling).
  - For goals where SDD exists but there are no tickets:
    - Agent treats the task as “already planned” and starts coding directly, **without enforcing a ticket backlog**.

Root causes (design level):
- Ticket closing:
  - `ticket_closer` is wired, but:
    - Completion semantics (`done` flag) are entirely LLM-driven in `verifier`.
    - CLI/run reports never label runs with ticket status, even when `ticket_closer` runs successfully.
- Ticket requirement for medium/large work:
  - There is no explicit policy in prompts or CLI enforcing:
    - “No medium/large task execution without tickets”.
  - `estimateTaskScope` exists but is only used for diagnostics and command selection, not for gating ticket usage.
  - `kotef run --goal` in a project with `.sdd/` but no open tickets runs directly against the goal with an empty `ticket`, bypassing backlog.

### 5.3. Target Ticket Behaviour

Definitions:
- **Small task**: `TaskScope = 'tiny'`.
- **Medium task**: `TaskScope = 'normal'`.
- **Large task**: `TaskScope = 'large'`.

Requirements:
- For **medium and large tasks**:
  - Always have explicit tickets in `.sdd/backlog/tickets/open` before coding.
  - Do **not** treat “SDD present but no tickets” as “planned”.
  - Do not start execution when no tickets exist; either:
    - generate tickets, or
    - fail/ask for orchestration.
- For **small tasks**:
  - Allow working:
    - with at most 3 micro-tickets, or
    - directly in 1–3 steps without heavy SDD planning.

Consequences for implementation:
- **Open → Closed**:
  - After each ticket execution where `done === true`:
    - ticket file must be moved from `open/` to `closed/` (by `ticket_closer` or a fallback in CLI).
    - run report must record:
      - `ticketId` (from filename, e.g. `17-goal-aware-verification`);
      - `ticketPath` (final path, open or closed);
      - `ticketStatus` (`"closed"` if moved to `closed/`, otherwise `"open"`).
- **Ticket requirement gating**:
  - Reuse `estimateTaskScope` to classify size.
  - For `run`/`chat` flows:
    - If `TaskScope` is `normal` or `large` and there is no selected ticket:
      - either:
        - run a goal→tickets orchestration step (ticket generator only), or
        - block with a clear message instructing the user to create tickets (short-term safety).
    - For `TaskScope = 'tiny'`:
      - allow direct runs without tickets by design.
- **Prompts**:
  - `meta_agent` and `planner` prompts should explicitly mention:
    - The distinction between tiny/normal/large.
    - That non-tiny tasks for repos with SDD should normally be executed **via tickets**, not ad-hoc goals.

---

## 6. Planned Changes (High-Level)

This section is the basis for separate SDD tickets.

Deep search:
- Add a `ResearchStrategy` computation in `src/tools/deep_research.ts`:
  - Inputs: goal, optional originalGoal, optional taskScope, optional taskType hint, optional SDD context snippet.
  - Outputs: `{ level: 'none' | 'shallow' | 'medium' | 'deep', maxAttempts, maxResults, topPages, searchDepth }`.
- Extend `DeepResearchOptions` to accept:
  - `taskScope?: 'tiny' | 'normal' | 'large'`;
  - `taskTypeHint?: 'reference' | 'debug' | 'architecture' | 'research'`;
  - optional `sddContextSnippet?: string`.
- Wire strategy into:
  - `webSearch` calls (`maxResults`, `search_depth`);
  - number of pages fetched per attempt;
  - stopping logic (including simple diminishing-returns check).
- Make `researcherNode` pass:
  - `taskScope` from `state.taskScope`;
  - classification hints derived from goal/ticket text (simple keyword-based);
  - short SDD context snippet (architect/best_practices summary if available).
- Keep the high-level contract:
  - `DeepResearchResult` shape unchanged;
  - `ResearchQuality` remains the primary feedback signal for planner.

Ticket flow:
- Update CLI run/reporting:
  - For ticket execution (both `run --ticket` and chat-mode sequential tickets):
    - Set `ticketId`, `ticketPath` and `ticketStatus` in `RunSummary` based on:
      - initial selected ticket filename;
      - final `result.sdd.ticketPath` (to detect open vs closed path).
  - Optionally add a lightweight fallback:
    - If `result.done === true` and `ticketPath` still points to `backlog/tickets/open`, perform a final move open→closed in CLI as a safety net (while keeping `ticket_closer` as the primary path).
- Enforce ticket requirement for non-tiny tasks:
  - In `kotef run` when `.sdd/` exists and `--goal` is provided but no `--ticket`:
    - Compute `taskScope`.
    - If `taskScope !== 'tiny'` and there are **no** open tickets:
      - run a new, minimal “tickets-only” orchestration flow that:
        - reuses existing `.sdd/architect.md` + the new goal to create ticket files in `.sdd/backlog/tickets/open`;
        - does not overwrite existing SDD artifacts.
      - then either:
        - auto-execute the newly generated tickets sequentially (similar to chat), or
        - fail fast with a clear message telling the user which tickets were created.
    - If `taskScope !== 'tiny'` and open tickets already exist:
      - keep current behaviour but log a warning that using `--ticket` is recommended.
- Prompt updates:
  - `meta_agent.md`:
    - Document that medium/large tasks in existing SDD projects should run via tickets and that tiny tasks may run ad-hoc.
  - `planner.md`:
    - Include explicit mention of `TASK_SCOPE`:
      - For `tiny`, keep plans minimal and avoid heavy research / SDD edits.
      - For `normal`/`large`, plans should assume a ticket context and avoid silently expanding scope beyond the ticket; new work should become follow-up tickets.

---

This note is intentionally implementation-focused and is the source of truth for the upcoming SDD tickets under `.sdd/backlog/tickets/open` that will drive the actual changes in code and prompts.

