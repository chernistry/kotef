1. MODERN APPROACHES AND IDEAS (SYNTHESIZED OVERVIEW)

---

### 1.1 Flow, delivery performance, and DevEx

**DORA & Continuous Delivery**

DORA research (Accelerate reports) consistently finds that teams with high *deployment frequency*, low *lead time for changes*, low *change failure rate*, and fast *time to restore* deliver more value and have better stability.([Dora][1]) Continuous Delivery (Humble/Farley) frames this as a *deployment pipeline* with automated build, test, and deploy to reduce batch size and risk.([continuousdelivery.com][2])

Implications for an agent:

* Optimize for *small, reversible changes* with fast feedback.
* Treat “time from change to verification” and “change failure rate” as internal agent metrics (local DORA proxies).
* Plan work to minimize “blast radius” of each change and keep trunk releasable.

**Trunk-based development, feature flags, progressive delivery**

Modern trunk-based development recommends frequent commits to a shared main branch, guarded by automated tests, feature flags, and safe deployment strategies (canary, blue-green, progressive rollouts).([aviator.co][3])

Implications for an agent:

* Prefer *feature-flagged* changes and additive, backward-compatible edits.
* When a change implies breaking behavior or migration, create an explicit *“compatibility risk”* entry and often a separate tech-debt/migration ticket.
* Assume “you are working on trunk”: do not leave the codebase in a non-buildable state at the end of a session.

**SPACE & Developer Experience**

The SPACE framework (Satisfaction, Performance, Activity, Communication & collaboration, Efficiency & flow) emphasizes multi-dimensional measurement of productivity and developer experience.([Microsoft][4])

Implications for an agent:

* Don’t optimize just for local coding activity; consider:

  * How your change affects *operational performance* (latency, errors).
  * How it affects *DX*: clarity of APIs, error messages, logs, tests.
  * How future humans (and agents) will *understand and evolve* this area.

### 1.2 Architecture and long-term evolution

**Domain-Driven Design (DDD), modular monolith, hexagonal architecture**

Modern DDD emphasizes *ubiquitous language*, *bounded contexts*, and aligning architecture with domain boundaries.([DEV Community][5]) Modular monoliths provide microservice-like modularity without the operational overhead; they keep clear internal modules inside one deployable unit.([Medium][6]) Hexagonal (ports-and-adapters) architectures separate core domain logic from infrastructure, interfaces, and frameworks.([Medium][7])

Implications for an agent:

* Treat “module boundaries”, “bounded contexts”, and “ports/adapters” as *first-class constraints* in the architecture spec.
* Prefer changes that *respect existing boundaries* over ones that cross-cut them.
* When boundaries are unclear, propose and record an explicit *architecture decision* (ADR) instead of silently introducing new coupling.

**Evolutionary architecture & fitness functions**

“Building Evolutionary Architectures” promotes *fitness functions* — executable checks (tests, metrics) that protect key system qualities (e.g. latency, coupling, schema compatibility).([Neal Ford][8])

Implications for an agent:

* Treat tests, linters, metrics, contract tests, and SLO probes as *fitness functions*.
* When adding new behavior or changing architecture, extend or add fitness functions that capture the desired invariant (e.g. “API must remain backward compatible on these fields”).

**Architecture Decision Records (ADR)**

ADRs (popularized by Michael Nygard) are small documents capturing *context, decision, and consequences* of architectural choices.([Architectural Decision Records][9])

Implications for an agent:

* For any non-trivial structural change (new service/module, new storage choice, new protocol), write or update an ADR entry in the “brain”.
* Use ADRs as *stateful memory* of trade-offs and rejected options to avoid repeating design flailing.

**Socio-technical: Team Topologies & Conway’s law**

Team Topologies frames four team types and three interaction modes to optimize *flow of change* and reduce cognitive load.([teamtopologies.com][10]) Conway’s law observes that system structure mirrors communication structure.([Wikipedia][11])

Implications for an agent:

* Infer from architecture/spec which module “belongs” to which team/ownership.
* Prefer to *localize changes* within existing ownership boundaries; raise tickets instead of cross-cutting changes when you’d modify many unrelated modules.

### 1.3 Testing, reliability, observability

**TDD/ATDD, property-based testing, contract testing**

Beyond classic unit tests, modern practice uses property-based testing (test invariants over many generated inputs)([hypothesis.works][12]) and consumer-driven contract testing (Pact and similar) for API reliability.([docs.pact.io][13])

Implications for an agent:

* When adding critical logic (calculations, parsers, transformations), consider *properties* (e.g. idempotence, order invariance) and propose property-based tests.
* For inter-service changes, prefer *contract tests* (consumer expectations) instead of only provider-centric tests.

**SLOs, error budgets, observability-driven development (ODD)**

SRE practice defines *SLIs/SLOs* and error budgets as explicit service reliability targets.([Google SRE][14]) Observability-driven development emphasizes instrumenting code with rich telemetry and using that data to guide design and debugging.([getambassador.io][15])

Implications for an agent:

* When changing critical paths, ensure relevant metrics/logs/traces are present or extended.
* If a change may impact an SLO, record that risk and suggest updated/error-budget-aware rollout strategy.

### 1.4 Product & process: Shape Up, dual-track, discovery

Basecamp’s Shape Up promotes *shaping work* into well-defined bets, fixed-length cycles (often 6 weeks), and *variable scope* to ensure shipping on time.([Basecamp][16]) Dual-track agile and continuous discovery emphasize parallel *discovery* and *delivery* tracks, with continuous user research and hypothesis validation.([LogRocket Blog][17])

Implications for an agent:

* Treat each goal as a *shaped bet* with appetite, constraints, and clear non-goals.
* Be explicit when scope must be cut to ship — prefer a smaller solid feature over a large half-done change.

### 1.5 AI-assisted / agentic development

GitHub Copilot and newer AI coding agents run as *embedded teammates* that plan, edit code, run tests, and open pull requests while documenting decisions.([GitHub][18]) Modern agentic guidance emphasizes:

* Planner / executor / verifier splits, sometimes with different personas or models to reduce correlated failures.([polarixdata.com][19])
* Guardrails: budgets, loop detection, role clarity, RBAC, audit logs, and failsafes for costly or dangerous actions.([DevOps.com][20])

Implications for an agent:

* Kotef’s existing planner/researcher/coder/verifier map well to these patterns; the missing piece is *explicit operationalization* of risk, budgets, and decision logs (ADRs, tickets, metrics) rather than ad-hoc reasoning.

---

2. FULL-CYCLE ALGORITHM FOR CODING AGENT (KOTEF-COMPATIBLE)

---

I’ll structure this as 10 phases. Each phase can be implemented as:

* combinations of existing nodes (planner/researcher/coder/verifier/snitch/bootstrap),
* updates to SDD “brain” docs (project, architecture, best practices, tickets, ADRs),
* progress-controller and budget heuristics.

### Phase 1. Understand goal and context

**Goal**

Translate a high-level goal into a precise, scoped, testable change aligned with existing specs and Definition of Done (DoD).

**Inputs**

* `user_goal` (natural language).
* Current `project_spec`, `architect_spec`, `best_practices`, `ticket_backlog`.
* Historical notes / ADRs for relevant area.

**Outputs**

* `clarified_goal` (structured).
* Linked/updated tickets (e.g. primary feature ticket, subtasks).
* Possibly updated `project_spec` section for new functionality.
* Identified constraints (time, appetite, risk level, environment).

**Agent steps**

* Read project + architecture + best-practices sections relevant to the goal.

* Extract or infer:

  * Domain concepts involved (DDD-style language).
  * Affected bounded context/module.
  * High-level non-functionals (latency, security, data volume).

* Ask itself “Shape Up style” questions:

  * What is the *appetite* (how far to go) vs ideal solution?
  * What is *explicitly out of scope*?

* Produce a small “Goal spec” object, e.g.:

  * `functional_outcomes` (what must be true).
  * `non_functional_risks` (what must not regress).
  * `DoD_checks` (tests, probes, commands to pass).
  * `constraints` (no schema changes, must be behind flag, etc.).

* Record/update a primary ticket with:

  * goal summary,
  * acceptance criteria,
  * links to DoD and relevant SDD sections.

**Senior/staff heuristics**

* If the goal is underspecified or conflicts with specs, mark `status=blocked:requirements` and propose clarifying questions (even if they will be answered later by a human).
* Prefer *small bets* — if goal implies very large change, cut into milestones and record only M1 as current target.

**Completion criteria**

* `clarified_goal` exists and is linked to DoD.
* Relevant SDD sections referenced (or created).
* Scope is small enough to be deliverable within given budgets.

---

### Phase 2. Analyze current system state

**Goal**

Build a concise mental model of the impacted area: architecture, code, tests, performance, and historical hot spots.

**Inputs**

* `clarified_goal`.
* Codebase (via semantic search tools).
* Tests, coverage reports, linters/LSP diagnostics.
* Conceptual git history access (e.g. “files with most changes recently”, “recent bugfixes in this area”).

**Outputs**

* `impact_map`: list of modules/files/APIs likely involved.
* `risk_map`: hot spots (complexity, churn, previous bugs).
* `knowledge_gaps` requiring research.

**Agent steps**

* Use semantic + textual search to locate:

  * relevant modules/services,
  * domain entities,
  * API endpoints, commands, jobs.
* Conceptually query git-like signals:

  * which files in this area change often,
  * recent bugfixes touching these modules,
  * test files mapped to these components (even as heuristic).
* Collect diagnostics:

  * existing failing tests,
  * deprecation warnings,
  * TODO/FIXME comments.
* Summarize into a short internal “system snapshot”:

  * key flows,
  * known weak areas,
  * coupling points and seams.

**Senior/staff heuristics**

* Avoid high-risk refactors in hot, fragile areas unless they directly reduce risk or are covered with good tests.
* Prefer to *attach* new behavior at stable seams (ports/adapters, extension points) instead of inlining into tangled core logic.

**Completion criteria**

* `impact_map` and initial `risk_map` stored in working state.
* No major unknowns about “where to start” remain (or they are explicitly recorded as `knowledge_gaps` for research).

---

### Phase 3. Design & decision-making (architecture/approach)

**Goal**

Select a minimally sufficient design, explicitly documenting trade-offs and constraints via ADR-like entries.

**Inputs**

* `clarified_goal`, `impact_map`, `risk_map`.
* Architecture principles and patterns from `architect_spec` (DDD, modular monolith, hexagonal, etc.).
* Non-functional requirements, SLOs, compliance constraints where known.

**Outputs**

* `solution_sketch`: data flows, component interactions, responsibilities.
* New or updated ADRs for meaningful design choices.
* Updated `architect_spec` sections if architecture evolves.

**Agent steps**

* Enumerate 2–3 feasible options (e.g. “new endpoint on existing service vs. small internal module vs. new background job”).

* For each option, estimate:

  * change size and complexity,
  * risk to existing invariants / SLOs,
  * alignment with architecture principles (DDD boundaries, hexagonal layers).

* Pick one primary option based on explicit criteria (speed vs risk vs future extensibility).

* Write or update ADR:

  * `Context`: what is changing; why now.
  * `Decision`: chosen option.
  * `Consequences`: positive, negative, and mitigations.

* If the decision introduces a future constraint or debt, create a *tech-debt ticket* linked from ADR.

**Senior/staff heuristics**

* Choose *simplest architecture that can plausibly survive 1–2 more iterations*, not the theoretical ideal.
* Avoid speculative extensibility; do not create new abstractions until at least two concrete use cases are present.
* If no option is clearly acceptable under constraints, mark as `blocked:architecture` rather than forcing a bad design.

**Completion criteria**

* ADR created/updated for any non-trivial design.
* `solution_sketch` exists and is consistent with architecture spec and constraints.
* Risks and trade-offs are explicitly recorded.

---

### Phase 4. Work planning & strategy selection

**Goal**

Translate design into a sequence of small, verifiable steps with explicit budgets and execution profile.

**Inputs**

* `solution_sketch`, ADRs.
* Current execution profile (strict/fast/smoke/yolo).
* Budgets for:

  * tool calls (LLM, search),
  * test/command executions,
  * time or token constraints.

**Outputs**

* `work_plan`: ordered list of micro-steps (tickets/subtasks).
* Selected `execution_profile`.
* Budget allocations per phase (research, coding, verification).

**Agent steps**

* Decompose into steps aligned with DORA/Shape Up ideas:

  * add/extend tests (if TDD/ATDD style),
  * implement minimal code,
  * wire into interfaces,
  * run targeted tests and probes,
  * refactor/cleanup.

* For each step, define:

  * expected observable signals (test passes, log output, metric changes),
  * rollback options (files touched, flags, toggles).

* Choose execution profile:

  * `strict`: more research, tests, and ADRs; for core or risky changes.
  * `fast`: moderate checks; for well-understood low-risk areas.
  * `smoke`: narrow tests; for exploratory or non-critical paths.
  * `yolo`: only allowed under explicit flag for prototypes or dead branches.

* Assign budgets:

  * max number of test runs,
  * max heavy commands (builds, migrations),
  * max external calls (search).

**Senior/staff heuristics**

* Prefer plans where each step can be validated in isolation.
* Reserve budget for *diagnostics/recovery*: do not spend all tokens on initial coding.
* If budgets are too tight to safely complete, mark that constraint in the primary ticket.

**Completion criteria**

* `work_plan` exists and covers end-to-end path from current state to DoD.
* Budgets and execution profile set and stored for planner.

---

### Phase 5. Implementation (minimal diffs in existing code)

**Goal**

Apply the planned change via minimal, reversible diffs that respect existing architecture and patterns.

**Inputs**

* `work_plan` current step.
* Codebase, tests, diagnostics.
* Best practices spec (style, error handling, logging, security).

**Outputs**

* Patch/diff(s) to code, config, tests.
* Local, incremental test runs / linters results.

**Agent steps**

For each micro-step:

* Identify target files via semantic search and impact map.
* Before editing:

  * scan for patterns, invariants, guard clauses, error handling standards,
  * detect existing tests covering this logic.
* Apply *small* diffs:

  * prefer extending existing functions over creating new ones if they remain coherent.
  * or introduce new well-named functions and rewire call sites for clarity.
* Update tests alongside implementation:

  * add or adjust ATDD examples or property-based tests where appropriate.
* Keep an internal “change log” (files touched, rationale) for the snitch/ticket_closer to use.

**Senior/staff heuristics**

* Avoid drive-by refactors; only refactor when it:

  * reduces risk (e.g. untangles duplicated logic),
  * is required to implement a change cleanly.
* Don’t “fix” style issues unrelated to the goal unless trivial and clearly beneficial; record them as low-priority debt instead.
* Prefer changes that reduce cognitive load for future readers (naming, decomposition, removing dead code).

**Completion criteria**

* Implemented behavior matches `solution_sketch` for the step.
* Code builds locally (or is expected to after tests in Phase 6).
* No obvious violations of best-practices spec introduced.

---

### Phase 6. Testing, diagnostics, and functional verification

**Goal**

Verify the change using appropriate tests and diagnostics; interpret failures correctly.

**Inputs**

* Latest code.
* Test suites (unit, integration, e2e, property-based, contract tests).
* Observability hooks (logs, metrics, traces) where accessible.
* SLO/SLA definitions if available.

**Outputs**

* Test and command results (structured).
* Updated risk assessments.
* Possibly new or improved tests.

**Agent steps**

* Run *targeted tests first*:

  * tests for impacted modules,
  * contract tests for affected APIs,
  * property-based tests for sensitive logic.
* If budget allows, escalate to broader suites (smoke/full).
* Analyze failures:

  * differentiate between flaky/irrelevant failures and direct regressions.
  * correlate failure stack traces to impact map.
* If observability hooks are available in dev/stage, propose:

  * new metrics/logs for critical paths,
  * e.g. counters for “new feature used” or “error path taken”.

**Senior/staff heuristics**

* Do not ignore “unrelated” failing tests in touched areas; they often reveal hidden coupling.
* For flaky tests unrelated to your change:

  * record a tech-debt ticket,
  * avoid hacking in sleeps or random delays.
* When contract tests fail due to your change, treat this as a *breaking change*—roll back or add compatibility layers.

**Completion criteria**

* All tests relevant to the change pass, or failures are explicitly justified and ticketed.
* Observability coverage is adequate (no “dark code” on critical paths).

---

### Phase 7. Refactoring and technical debt management

**Goal**

Reduce structural risk where it most matters, without scope creep; record remaining debt explicitly.

**Inputs**

* `risk_map`, test results, code complexity indicators.
* Fit with DDD boundaries and hex/modular monolith principles.

**Outputs**

* Small targeted refactors (if budgets allow).
* `tech_debt` tickets and updated `risk_register`.

**Agent steps**

* Revisit `risk_map` and highlight:

  * high-churn + high-complexity files in the impact area.
  * recurring “code smells” that hinder change.
* If budgets and risk allow, apply refactors that:

  * simplify control flow,
  * extract well-named helper functions,
  * isolate side effects behind ports/adapters.
* For larger issues (e.g., misaligned bounded context, cross-module coupling), create tech-debt tickets with:

  * impact,
  * suggested approach,
  * prerequisites.

**Senior/staff heuristics**

* Only refactor inside the “cone of change” triggered by the current goal, unless the refactor clearly prevents future incidents.
* Balance immediate delivery vs long-term risk with an implicit error-budget mindset: if reliability budget is nearly exhausted, favor refactor/safety over new features.

**Completion criteria**

* No severe new debt introduced by the change.
* Significant risks in the modified area are either mitigated or captured in tickets with clear next steps.

---

### Phase 8. Documentation and “brain” updates

**Goal**

Align the SDD brain (project, architecture, best practices, ADRs, tickets) with the actual system after the change.

**Inputs**

* Implemented code and tests.
* ADRs and solution sketch.
* Any new patterns discovered or anti-patterns avoided.

**Outputs**

* Updated `project_spec` (behavior, user-facing semantics).
* Updated `architect_spec` (structure, module responsibilities).
* Updated `best_practices` (new patterns, pitfalls).
* Closed/updated tickets.

**Agent steps**

* For user-visible or API behavior changes:

  * update project spec sections (including examples).
* For structural changes:

  * update architecture diagrams/sections, module responsibilities, and invariants.
* For lessons learned:

  * append to best-practices doc:

    * “When in situation X, prefer pattern Y because…”
* Close or move tickets to “ready for human review” with:

  * summary of what changed,
  * links to ADRs,
  * failing/succeeding tests and metrics.

**Senior/staff heuristics**

* Prefer short, concrete doc updates over long essays: specs should reflect *current truth* and be cheaply maintainable.
* When behavior diverges from spec, *update the spec*, do not leave it stale.

**Completion criteria**

* All relevant docs and tickets reflect the new reality.
* A future agent/human can reconstruct what was done and why from ADR + ticket + spec.

---

### Phase 9. Integration / deployment preparation

(Conceptual for kotef; some parts may be advisory rather than executable.)

**Goal**

Ensure the change is safe to integrate and ready for deployment within modern CD/progressive delivery practices.

**Inputs**

* Code + tests (passing).
* Deployment/checklist conventions from `best_practices`.
* SLOs/error budgets if available.

**Outputs**

* Integration checklist or PR description content.
* Flags to indicate rollout strategy (flag name, default state).
* Risk annotations for reviewers.

**Agent steps**

* Prepare structured “change summary”:

  * what changed,
  * why (link ADR/ticket),
  * how to validate in staging/production,
  * potential rollback steps.
* Recommend rollout approach (using feature flags, canary, blue-green semantics):

  * e.g., “behind flag X; enable 5% users; observe error metric Y”.
* Ensure configuration changes are backward compatible where possible.
* If SLO or error budget is tight, note that in the summary and suggest slower rollout.

**Senior/staff heuristics**

* Always assume *partial rollback* might be needed: avoid interdependent changes that can’t be toggled.
* Prefer “dark launch” + observability over big-bang deployment.

**Completion criteria**

* Integration summary/checklist ready.
* Rollout and rollback strategies documented.
* No unreviewed risky changes remain.

---

### Phase 10. Retrospective and agent learning

**Goal**

Capture learnings to improve future behavior of the agent and the system.

**Inputs**

* Entire session history:

  * steps taken,
  * where budgets were spent,
  * where the agent got stuck or looped,
  * errors encountered.

**Outputs**

* Updated internal heuristics/notes for prompts (meta-best-practices).
* Metrics for progress controller (where were loops, overruns).
* Possibly new entries in `best_practices` like “patterns that worked poorly”.

**Agent steps**

* Summarize:

  * what went well (fast success),
  * what was hard (gaps in specs, fragile areas),
  * where the agent overused tools or tests.
* Tag patterns:

  * e.g. “semantic search struggled for this pattern; consider improving mapping”.
* Feed into:

  * planner heuristics (e.g., more research before coding in certain modules),
  * researcher heuristics (better query templates).
* Optionally create a small “retrospective log” node entry for inspection.

**Senior/staff heuristics**

* Focus on *systemic* improvements (docs, patterns, heuristics) rather than blaming local failures.
* Use failure cases to add new tests/fitness functions and clarifications in the SDD brain.

**Completion criteria**

* At least a minimal retrospective note recorded.
* Adjusted heuristics or TODOs exist for future refinement.

---

### Machine-readable phase structure (for node-graph mapping)

```text
PHASES = [
  {
    "id": "understand_goal",
    "mapped_nodes": ["planner", "bootstrap"],
    "goal": "Clarify goal, scope, and DoD in terms of existing specs",
    "inputs": ["user_goal", "project_spec", "architect_spec", "best_practices", "tickets"],
    "outputs": ["clarified_goal", "updated_project_spec", "goal_ticket"],
    "actions": [
      "read_relevant_specs",
      "identify_domain_and_module",
      "define_DoD_and_constraints",
      "create_or_update_goal_ticket"
    ],
    "entry_signals": ["new_goal_received"],
    "exit_conditions": ["goal_is_unambiguous", "DoD_criteria_defined"],
    "senior_heuristics": [
      "cut_scope_if_too_broad",
      "explicitly_record_non_goals"
    ],
    "metrics": ["ambiguity_level", "scope_risk"]
  },
  {
    "id": "analyze_system_state",
    "mapped_nodes": ["planner", "coder", "verifier"],
    "goal": "Understand impacted code, tests, and risks",
    "inputs": ["clarified_goal", "codebase_search", "diagnostics", "git_signals"],
    "outputs": ["impact_map", "risk_map", "knowledge_gaps"],
    "actions": [
      "semantic_search",
      "collect_diagnostics",
      "analyze_git_hotspots",
      "summarize_system_snapshot"
    ],
    "entry_signals": ["goal_is_unambiguous"],
    "exit_conditions": ["impact_map_defined"],
    "senior_heuristics": [
      "avoid_refactor_in_hot_spots_without_tests",
      "prefer_stable_seams_for_changes"
    ],
    "metrics": ["area_complexity", "historical_churn"]
  },
  {
    "id": "design_decide",
    "mapped_nodes": ["planner", "researcher"],
    "goal": "Select minimally sufficient design and document decisions",
    "inputs": ["impact_map", "risk_map", "architect_spec", "best_practices"],
    "outputs": ["solution_sketch", "adrs", "updated_architect_spec"],
    "actions": [
      "enumerate_design_options",
      "evaluate_tradeoffs",
      "choose_design",
      "write_adr"
    ],
    "entry_signals": ["impact_map_defined"],
    "exit_conditions": ["adr_written_or_confirmed"],
    "senior_heuristics": [
      "prefer_simple_design_with_evolution_path",
      "avoid_speculative_abstractions"
    ],
    "metrics": ["design_complexity", "risk_score"]
  },
  {
    "id": "plan_work",
    "mapped_nodes": ["planner"],
    "goal": "Create stepwise work plan with budgets",
    "inputs": ["solution_sketch", "execution_profiles", "budgets"],
    "outputs": ["work_plan", "selected_execution_profile", "budget_allocation"],
    "actions": [
      "split_into_microsteps",
      "define_validation_per_step",
      "choose_execution_profile",
      "assign_budgets"
    ],
    "entry_signals": ["adr_written_or_confirmed"],
    "exit_conditions": ["work_plan_ready"],
    "senior_heuristics": [
      "ensure_each_step_has_clear_signal",
      "reserve_budget_for_diagnostics"
    ],
    "metrics": ["step_count", "budget_risk"]
  },
  {
    "id": "implement",
    "mapped_nodes": ["coder"],
    "goal": "Apply minimal, reversible code changes per plan",
    "inputs": ["work_plan", "codebase", "best_practices"],
    "outputs": ["code_diffs", "local_test_results"],
    "actions": [
      "locate_target_files",
      "inspect_existing_patterns",
      "apply_minimal_diffs",
      "update_or_add_tests"
    ],
    "entry_signals": ["work_plan_ready"],
    "exit_conditions": ["planned_code_changes_complete"],
    "senior_heuristics": [
      "avoid_drive_by_refactors",
      "keep_changes_small_and_reviewable"
    ],
    "metrics": ["diff_size", "files_touched"]
  },
  {
    "id": "verify",
    "mapped_nodes": ["verifier"],
    "goal": "Verify behavior with tests and diagnostics",
    "inputs": ["code_diffs", "test_suites", "observability_hooks"],
    "outputs": ["verification_results", "updated_risk_map"],
    "actions": [
      "run_targeted_tests",
      "escalate_to_broader_suites_if_budget",
      "analyze_failures",
      "propose_observability_improvements"
    ],
    "entry_signals": ["planned_code_changes_complete"],
    "exit_conditions": ["tests_pass_or_failures_justified"],
    "senior_heuristics": [
      "treat_contract_failures_as_breaking_changes",
      "log_and_ticket_flaky_tests"
    ],
    "metrics": ["tests_run", "failure_rate"]
  },
  {
    "id": "refactor_and_debt",
    "mapped_nodes": ["coder", "planner"],
    "goal": "Reduce critical technical risk, capture remaining debt",
    "inputs": ["risk_map", "verification_results"],
    "outputs": ["refactor_diffs", "tech_debt_tickets"],
    "actions": [
      "identify_high_risk_hotspots",
      "apply_small_safety_refactors",
      "record_remaining_risks_as_tickets"
    ],
    "entry_signals": ["tests_pass_or_failures_justified"],
    "exit_conditions": ["critical_risks_mitigated_or_ticketed"],
    "senior_heuristics": [
      "refactor_inside_cone_of_change",
      "balance_delivery_vs_risk_using_error_budget_mindset"
    ],
    "metrics": ["risk_reduction_score", "debt_ticket_count"]
  },
  {
    "id": "update_brain",
    "mapped_nodes": ["snitch"],
    "goal": "Align SDD brain (specs, ADRs, best practices, tickets) with reality",
    "inputs": ["solution_sketch", "code_diffs", "verification_results", "adrs"],
    "outputs": [
      "updated_project_spec",
      "updated_architect_spec",
      "updated_best_practices",
      "closed_or_updated_tickets"
    ],
    "actions": [
      "update_project_behavior_descr",
      "update_architecture_sections",
      "append_best_practices_entries",
      "update_ticket_statuses"
    ],
    "entry_signals": ["critical_risks_mitigated_or_ticketed"],
    "exit_conditions": ["docs_and_tickets_consistent_with_code"],
    "senior_heuristics": [
      "keep_docs_small_but_truthful",
      "never_leave_specs_stale"
    ],
    "metrics": ["doc_drift", "ticket_alignment"]
  },
  {
    "id": "prepare_integration",
    "mapped_nodes": ["planner", "snitch"],
    "goal": "Prepare change for safe integration and rollout",
    "inputs": ["updated_specs", "verification_results", "rollout_practices"],
    "outputs": ["integration_summary", "rollout_plan", "rollback_plan"],
    "actions": [
      "summarize_change_for_review",
      "propose_rollout_strategy",
      "define_rollback_steps"
    ],
    "entry_signals": ["docs_and_tickets_consistent_with_code"],
    "exit_conditions": ["integration_summary_ready"],
    "senior_heuristics": [
      "always_define_rollback",
      "prefer_feature_flags_and_canaries"
    ],
    "metrics": ["rollout_risk"]
  },
  {
    "id": "retrospect",
    "mapped_nodes": ["planner", "snitch"],
    "goal": "Capture learnings to improve future agent performance",
    "inputs": ["session_history", "metrics"],
    "outputs": ["retro_notes", "updated_heuristics"],
    "actions": [
      "summarize_successes_and_failures",
      "identify_heuristic_gaps",
      "update_internal_best_practices"
    ],
    "entry_signals": ["integration_summary_ready"],
    "exit_conditions": ["retro_notes_recorded"],
    "senior_heuristics": [
      "focus_on_systemic_improvements",
      "translate_failures_into_new_tests_and_specs"
    ],
    "metrics": ["loop_incidents", "budget_overruns"]
  }
]
```

---

3. WHAT JUNIOR-LEVEL AGENTS TYPICALLY MISS AND HOW TO FIX IT (KOTEF EXAMPLE)

---

Below: capability → essence → how to operationalize in kotef.

### 3.1 Systems / architectural thinking

**Essence**

Seeing beyond individual functions; reasoning in terms of domains, bounded contexts, flows, and invariants (DDD, modular monolith, hex architecture).([DEV Community][5])

**Operationalization**

* Extend `architect_spec` with:

  * explicit bounded contexts/modules,
  * ownership and responsibilities,
  * known seams (ports/adapters).
* In planner:

  * forbid changes that touch more than N contexts without ADR.
* In coder:

  * add rule: “if a change crosses module boundaries, require planner to revisit Phase 3 (design_decide).”

### 3.2 Working with constraints and costs

**Essence**

Balancing speed vs quality, DX vs UX, short-term vs long-term evolution; making trade-offs explicit (DORA, SPACE, SLOs, error budgets).([Dora][1])

**Operationalization**

* Add to ADR template:

  * “Impact on: speed, reliability, DX, UX; error-budget assumptions.”
* Planner:

  * if “risk to reliability” is high, *force* a stricter execution_profile (more tests, more research).
* Progress controller:

  * track local metrics:

    * test failure rate,
    * number of rollbacks,
    * average size of diffs.
  * throttle risky actions when recent quality history is bad.

### 3.3 Scope control and simplification

**Essence**

Saying “no” or “not now”; cutting scope to ensure shipping (Shape Up, CD).([Basecamp][16])

**Operationalization**

* Planner:

  * maintain an “appetite” parameter per goal.
  * if work_plan exceeds appetite (estimated steps too big), automatically:

    * shrink scope (drop secondary features),
    * move them to follow-up tickets.
* Coder:

  * when encountering incidental complexity, prefer to defer big refactors into tickets rather than expanding the current change.

### 3.4 Recording decisions and assumptions

**Essence**

Not just making choices, but leaving a trace (ADRs, assumption lists, spec updates).([Architectural Decision Records][9])

**Operationalization**

* “Brain” extension:

  * add `assumptions.md` or a dedicated section in project/architecture spec.
* Planner:

  * whenever researcher uses a non-verified inference (e.g. from web search), record it as “assumption: tentative/provisional”.
* Snitch:

  * on completion, ensure:

    * each “hard” assumption is either confirmed (moved into spec) or explicitly left as “open” with a ticket.

### 3.5 Metrics and signals literacy

**Essence**

Using metrics (DORA, SPACE, SLOs, error budgets, observability signals) to guide decisions instead of gut feel.([Dora][1])

**Operationalization**

* Extend best-practices spec with:

  * “important metrics” for this project (latency, error rate, queue depth).
* Verifier:

  * when metrics are available, treat regressions as failures even if tests pass.
* Planner:

  * prefer solutions that improve or don’t harm key metrics; record metric impact in ADRs.

### 3.6 Research discipline

**Essence**

Not trusting the first link; cross-checking sources, freshness, and contradictions; using research to narrow uncertainty.([Logz.io][21])

**Operationalization**

* Researcher:

  * enforce minimum number of sources per key question (e.g. ≥3).
  * track:

    * recency,
    * source diversity,
    * agreement/disagreement.
  * output explicit `confidence` and `coverage` scores.
* Planner:

  * if research confidence is low, disallow “strict” profile implementation without human review.

### 3.7 Ability to stop and say “partial/blocked”

**Essence**

Senior engineers know when to stop, escalate, or deliver partial value instead of grinding endlessly.

**Operationalization**

* Progress controller:

  * track loop patterns (same plan steps failing repeatedly, or repeated file edits without convergence).
  * impose thresholds (e.g. max attempts per step).
* Planner:

  * when thresholds exceeded:

    * mark `status=blocked:<reason>` or `partial`.
    * summarize state for human handoff.
* Snitch:

  * write clear blocked/partial ticket updates:

    * what is done,
    * what’s missing,
    * what questions must be answered.

### 3.8 Git history / evolution awareness

**Essence**

Using git history to identify hot spots, past bugs, and hidden invariants (as in modern “code as a crime scene” approaches).([Medium][6])

**Operationalization**

* Planner:

  * on Phase 2, always request hot-spot signals (file churn, recent bugfixes).
* Coder:

  * if editing a file with many past bugfixes, be more conservative:

    * smaller diffs,
    * more tests,
    * prefer not to restructure the entire file.
* Snitch:

  * add notes to risk_register for modules with chronic issues.

### 3.9 Product thinking and discovery hooks

**Essence**

Connecting code changes to user value and hypotheses; leaving hooks for learning (Shape Up, dual-track, continuous discovery).([Basecamp][16])

**Operationalization**

* Project spec:

  * include “user problem” and “success signals” per feature.
* Planner:

  * when implementing feature flags, suggest capturing simple usage metrics:

    * events like “feature_used”, “error_seen”.
* Snitch:

  * record in tickets:

    * what should be observed post-release to confirm success.

---

4. FURTHER READING / KEY TERMS

---

You can use this as a reading/search list to refine prompts and templates:

* **Flow & DevEx**

  * “Accelerate: The Science of Lean Software and DevOps” (DORA).([Dora][1])
  * “DORA metrics” (deployment frequency, lead time, change failure rate, MTTR).([Planview][22])
  * “SPACE framework for developer productivity”.([Microsoft][4])

* **Architecture & evolution**

  * “Domain-Driven Design” (Eric Evans) and recent summaries.([DEV Community][5])
  * “Modular monolith vs microservices” (modern 2024–2025 takes).([Medium][6])
  * “Hexagonal / ports-and-adapters architecture”.([Medium][7])
  * “Building Evolutionary Architectures” and “fitness functions”.([Neal Ford][8])
  * “Architecture Decision Records (ADRs) Michael Nygard”.([Architectural Decision Records][9])

* **Reliability & observability**

  * Google SRE book and SLO/error-budget guidance.([Google SRE][14])
  * “Observability-driven development” (Charity Majors, Honeycomb).([getambassador.io][15])

* **Testing**

  * Property-based testing (Hypothesis, QuickCheck, modern guides).([hypothesis.works][12])
  * Consumer-driven contract testing (Pact).([docs.pact.io][13])

* **Process & product**

  * “Shape Up” (Basecamp).([Basecamp][16])
  * “Team Topologies” and Conway’s law.([teamtopologies.com][10])
  * Dual-track agile and continuous discovery.([LogRocket Blog][17])

* **Delivery & rollout**

  * “Continuous Delivery” (Humble/Farley).([continuousdelivery.com][2])
  * Trunk-based development, feature flags, canary/blue-green/progressive delivery.([aviator.co][3])

* **Agentic/AI dev**

  * GitHub Copilot docs and blogs (responsible AI pair programming, best practices, new AI agents).([GitHub][18])
  * “A practical guide to building agents” (OpenAI).([OpenAI][23])
  * Multi-agent systems, planner/executor/verifier patterns, and guardrails.([polarixdata.com][19])

This is enough structure to start refactoring kotef’s prompts, node transitions, and SDD templates so it behaves much closer to a strong senior/staff engineer rather than a smart junior.

[1]: https://dora.dev/research/2021/dora-report/2021-dora-accelerate-state-of-devops-report.pdf "2021 Accelerate State of DevOps Report"
[2]: https://continuousdelivery.com/ "What is Continuous Delivery? - Continuous Delivery"
[3]: https://www.aviator.co/blog/managing-continuous-delivery-with-trunk-based-development/ "How to Manage Continuous Delivery with Trunk-Based ..."
[4]: https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/ "The SPACE of Developer Productivity: There's more to it ..."
[5]: https://dev.to/horse_patterns/understanding-domain-driven-design-ddd-2h6o "Understanding Domain-Driven Design (DDD)"
[6]: https://medium.com/codex/what-is-better-modular-monolith-vs-microservices-994e1ec70994 "What is better? Modular Monolith vs Microservices"
[7]: https://devcookies.medium.com/a-detailed-guide-to-hexagonal-architecture-with-examples-042523acb1db "A Detailed Guide to Hexagonal Architecture with Examples"
[8]: https://nealford.com/books/buildingevolutionaryarchitectures.html "Building Evolutionary Architectures"
[9]: https://adr.github.io/ "Architectural Decision Records"
[10]: https://teamtopologies.com/book "Book — Team Topologies - Organizing for fast flow of value"
[11]: https://en.wikipedia.org/wiki/Conway%27s_law "Conway's law"
[12]: https://hypothesis.works/articles/what-is-property-based-testing/ "definition of property based testing"
[13]: https://docs.pact.io/ "Pact Docs: Introduction"
[14]: https://sre.google/workbook/implementing-slos/ "Chapter 2 - Implementing SLOs"
[15]: https://www.getambassador.io/podcasts/charity-majors-observability "Charity Majors on Observability-Driven Development and ..."
[16]: https://basecamp.com/shapeup/0.3-chapter-01 "Introduction | Shape Up"
[17]: https://blog.logrocket.com/product-management/dual-track-agile-continuous-discovery/ "Dual-track agile and continuous discovery: What you need ..."
[18]: https://github.com/features/copilot "GitHub Copilot · Your AI pair programmer"
[19]: https://polarixdata.com/nl/blog/designing-a-state-of-the-art-multi-agent-system/ "Designing a State-of-the-Art Multi-Agent System - Polarix"
[20]: https://devops.com/before-you-go-agentic-top-guardrails-to-safely-deploy-ai-agents-in-observability/ "Before You Go Agentic: Top Guardrails to Safely Deploy AI ..."
[21]: https://logz.io/blog/dora-metrics-improving-devops-performance/ "Improving DevOps Performance with DORA Metrics"
[22]: https://www.planview.com/resources/articles/what-are-dora-metrics/ "DORA Metrics: Guide to Measuring Software Delivery ..."
[23]: https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf "A practical guide to building agents"
Below is a “second layer” report: topics that are highly relevant but were not (or barely) touched in the first answer, with explicit links to how you’d bake them into kotef’s SDD brain + graph.

---

## 1. Additional Modern Approaches and Ideas

### 1.1 Platform engineering, IDPs, and golden paths

**Essence**

Platform engineering treats internal services, tools, and infra as a *product* with a clear API and UX for developers. Team Topologies explicitly positions platform teams as providers of “platform as a product” to reduce cognitive load for stream-aligned teams.([teamtopologies.com][1])

Golden paths are opinionated, preconfigured workflows (templates, pipelines, infra) that give safe, compliant “paved roads” for common scenarios. They reduce decision fatigue and accelerate flow by standardizing patterns.([Platform Engineering][2]) Internal developer platforms and portals (e.g. Backstage, Port, IDPs from vendors) are the UI around these paths.([Platform Engineering][3])

**Problems they solve**

* Random tool sprawl and bespoke pipelines per team.
* High cognitive load and onboarding cost.
* Inconsistent security / reliability posture across services.

**How to integrate into an agent like kotef**

Artifacts:

* Extend `architect_spec` with a *“Platform & golden paths”* section:

  * enumerate available golden paths (e.g., **service template A**, **batch job template B**, **event-driven service C**),
  * their intended use, constraints, and SLO expectations.
* Add a `platform_contracts` / “paved road” table to best-practices:

  * what’s allowed / discouraged off the paved road,
  * what extra justification is needed when deviating.

Signals:

* Whether the current change fits an existing golden path.
* Cognitive-load signals: number of tools, bespoke infra patterns used in a module.

Heuristics:

* **Planner**:

  * When a change resembles “new service / job / API,” *first* check if there’s a matching golden path.
  * Prefer using golden-path scaffolds (existing template repo, defined CI/CD, monitoring, policies).
  * If deviating, create an ADR entry “Deviation from golden path X” with rationale and consequences.
* **Coder**:

  * Conform to platform conventions (logging, metrics, health checks, config patterns) from the golden path.
* **Snitch**:

  * Update tickets/specs to say “Feature implemented using golden path X” for traceability.

Net effect: kotef behaves like a senior engineer who knows “how we do things here” and uses paved roads instead of ad-hoc infra.

---

### 1.2 Docs-as-code and API-/schema-first design

**Essence**

API-first (or design-first) means you design the API schema (HTTP APIs via OpenAPI, event APIs via AsyncAPI, etc.) *before* implementing.([APIs You Won't Hate][4]) Docs-as-code stores docs (designs, RFCs, runbooks) alongside code in version control and keeps them executable (e.g., OpenAPI/AsyncAPI specs, markdown design docs, CI-checked).

**Problems they solve**

* Design/code drift.
* Inconsistent APIs and event contracts.
* Hard-to-review behavior changes (no single source of truth).

**How to integrate into kotef**

Artifacts:

* Treat API specs as part of the SDD brain:

  * either separate `api_spec` artifacts (OpenAPI/AsyncAPI files),
  * or sections in `architect_spec` linking to those specs.
* Introduce a lightweight RFC template for bigger changes:

  * problem, options, proposed solution, impact.

Signals:

* Presence/absence of API specs for a service.
* Whether a behavior change is reflected in its contract (OpenAPI/AsyncAPI diff).
* CI checks that validate specs (lint, compatibility).

Heuristics:

* **Planner**:

  * For API changes, *force* a design-first mini-phase:

    * update or create the OpenAPI/AsyncAPI spec before code.
  * Require contract compatibility reasoning (e.g., no removed fields without migration path).
* **Coder**:

  * Use the spec as primary source for endpoints, types, error codes.
  * Generate or update tests from the contract (contract tests).
* **Verifier**:

  * Run contract tests / schema compatibility checks.
* **Snitch**:

  * Update RFC / API docs with final details (version, examples, known limitations).

This turns kotef into an engineer who treats interfaces as contracts, not “whatever the code happens to expose”.

---

### 1.3 Resilience & chaos engineering, Safety-II, and blameless postmortems

**Essence**

Resilience engineering and Safety-II focus on *how systems succeed under variability*, not just why they fail. Safety-II emphasizes proactive capacity to adapt and recover, as opposed to Safety-I’s focus on error counting.([ResearchGate][5])

Chaos engineering deliberately injects faults (service failures, latency, network partitions) to observe system behavior and improve resilience. Recent “Chaos Engineering 2.0” work ties chaos experiments into CI/CD pipelines and policy-guided experiments.([ResearchGate][6]) Blameless postmortems and continuous learning enable organizations to learn from incidents without punishing individuals.([conf42.com][7])

**Problems they solve**

* Hidden failure modes that never appear in normal tests.
* Repeated incidents because learnings are not captured.
* Fear/blame culture that suppresses signals about fragility.

**How to integrate into kotef**

Artifacts:

* Add `resilience_notes` or a “resilience & failure modes” section in `architect_spec`:

  * critical dependencies, fallback strategies, failure patterns seen in incidents.
* A simple “chaos experiment catalog” in the brain:

  * example: “kill cache for service X”, “add 500ms latency to Y”.
* Add postmortem summaries as part of SDD (or link to them) with key lessons and new invariants.

Signals:

* Is the change touching a known “resilience hotspot” (incident history, fallbacks)?
* Are there chaos experiments that validate this change?
* SLOs / error budgets related to resilience.

Heuristics:

* **Planner**:

  * For changes in critical paths, mark them as “resilience-sensitive”.
  * Encourage adding new resilience checks: timeouts, retries with backoff, idempotency, circuit breakers.
* **Verifier**:

  * Where infra pipeline allows, recommend or trigger simple chaos experiments in non-prod (dependency down, latency spike) and see if new code behaves acceptably.
* **Snitch**:

  * When a bug fix relates to an incident, append a Safety-II-style mini-postmortem entry: “how the system usually works & why it failed this time”, plus new resilience rules.

This makes kotef behave more like an SRE-aware engineer who thinks “how will this behave when things go wrong?” rather than only under happy path.

---

### 1.4 Software supply chain security and secure-by-design

**Essence**

Modern guidance (CISA “Secure by Design”, SLSA, OpenSSF OSPS baseline) focuses on *supply chain security* and secure defaults: protecting CI/CD, dependencies, artifacts, and SBOMs.([ResearchGate][8]) Threat modeling (STRIDE and variants) is key for secure-by-design, especially for CI/CD and pipelines themselves.([OX Security][9])

**Problems they solve**

* Dependency supply-chain attacks (malicious packages, typosquatting).([arXiv][10])
* Compromised build systems and artifact tampering.
* Security as an afterthought instead of a design axis.

**How to integrate into kotef**

Artifacts:

* Extend best-practices with a **security baseline** (inspired by OSPS baseline / SLSA levels):

  * minimal requirements for secrets, dependency policies, code signing, SBOMs.
* Add a “threat model” section per major component:

  * data assets, trust boundaries, likely attackers, key mitigations.

Signals:

* Use of pinned versions / verified registries for dependencies.
* Presence of SBOM generation in CI.
* Execution context (prod/deploy pipeline) vs local dev.

Heuristics:

* **Researcher**:

  * When task touches CI/CD or dependencies, check for recent supply-chain advisories or best practices.
* **Planner**:

  * If a change adds dependencies, enforce checks:

    * prefer existing approved libs,
    * record threat model updates if dependency is critical (crypto, auth, parsing).
* **Coder**:

  * Suggest and follow “secure by default” patterns: least privilege, parameterized queries, no secrets in code.
* **Verifier**:

  * Encourage running security scans (SAST/DAST/dep scanning) where allowed by budget.
* **Snitch**:

  * Add security-related ADR entries: “Why we trust this dependency”, “How CI/CD is protected”.

This moves kotef from “functionally correct junior” towards a senior who instinctively thinks about attack surfaces and pipelines.

---

### 1.5 Data/ML: data contracts, data mesh, ML observability, MLOps

**Essence**

Data mesh and data contracts treat data as *domain-owned products* with explicit schemas, quality guarantees, and access controls.([lakeFS][11]) MLOps/ML observability extend DevOps practices to ML systems: monitoring data drift, model performance, and data quality across pipelines, especially for real-time ML.([OpenLabs Research][12])

**Problems they solve**

* Hidden breaking changes in schemas.
* Data quality issues that silently degrade features or ML behavior.
* “One-off” ML integrations without lifecycle, retraining, or monitoring.

**How to integrate into kotef**

Artifacts:

* Treat data contracts like API contracts:

  * tables/streams with schemas, SLAs (freshness, completeness, latency).
* For ML features or LLM usage, add to `architect_spec`:

  * model endpoints, input/output expectations, evaluation metrics, retraining triggers.

Signals:

* Schema evolution history and consumers of each dataset.
* Data quality metrics (null rates, drift, anomaly scores).
* Model evaluation metrics / alerts.

Heuristics:

* **Planner**:

  * When touching data pipelines or ML features, treat data contract updates as first-class:

    * propose schema changes explicitly,
    * ensure backwards compatibility where possible.
* **Coder**:

  * Implement data validation and schema checks around boundaries.
  * Use typed contracts (e.g., pydantic/TS types) generated from data schemas.
* **Verifier**:

  * Trigger data quality checks where available (sampling tests, drift detection).
* **Snitch**:

  * Record data-consumer impact and add tasks for downstream teams if contracts change.

Your agent becomes someone who recognizes that “code” is only part of the system; data and models have their own lifecycle.

---

### 1.6 Collaboration: modern code review, pairing, mobbing

**Essence**

Modern practice blends trunk-based development with code review and pairing. Trunk-based guidance emphasizes small batches, short-lived branches (or direct commits), and rapid review cycles.([DEV Community][13]) Code reviews can be asynchronous PRs or synchronous via pairing/mobbing; empirical work shows pairing/mobbing improves quality and knowledge sharing, despite some cost overhead.([ResearchGate][14])

**Problems they solve**

* Solo hero coding, knowledge silos.
* Subtle bugs slipping through without review.
* Code that’s hard for others to understand or modify.

**How to integrate into kotef**

Artifacts:

* Add a short “reviewability checklist” to best-practices:

  * small diffs, clear commit messages, self-review notes, test evidence.
* Allow tickets to record “review hints”: what the reviewer should focus on, potential risks.

Signals:

* Diff size, number of files touched.
* Complexity of change vs reviewer bandwidth (implicitly: more complex => more explicit notes).

Heuristics:

* **Coder**:

  * Act as if preparing a PR for humans:

    * produce a summary of the change, key decisions, review considerations.
  * Avoid giant diffs; if necessary, split into phases with distinct tickets.
* **Snitch**:

  * Attach a “review guide” to the ticket:

    * what to check first,
    * what’s risky, what’s mechanical.
* **Planner**:

  * For very risky changes, recommend pairing/mobbing (or human collaboration) instead of fully autonomous execution.

Kotef starts writing like a senior who expects colleagues to read their work and makes that easy.

---

### 1.7 Risk-based change management and incident-driven improvement

**Essence**

Risk-based change management classifies changes by *risk level* and applies appropriate process rigor (testing depth, review requirements, rollout controls). Many orgs adopt explicit change categories (e.g., standard vs normal vs emergency) and risk scoring (blast radius, reversibility, uncertainty). Incident management and postmortems then feed back into these policies.

This is deeply aligned with resilience engineering and Safety-II: treat incidents as learning, not blame; update processes accordingly.([conf42.com][7])

**Problems they solve**

* Over- or under-process: treating risky changes casually or lightweight changes with heavy ceremony.
* Repeating the same failure modes.

**How to integrate into kotef**

Artifacts:

* Risk catalog in best-practices:

  * categories like *security-sensitive*, *data migration*, *schema change*, *feature flag only*.
* Simple risk scoring rubric: impact, reversibility, uncertainty.

Signals:

* Does this change touch auth, billing, data migrations, infra?
* Is there a known history of incidents in this area?

Heuristics:

* **Planner**:

  * Compute a risk score for each goal.
  * Map score → required process:

    * low risk: light tests, fast path;
    * higher risk: more tests, ADRs, staged rollout.
* **Verifier**:

  * For higher risk, require stronger evidence (broader tests, maybe chaos or load tests).
* **Snitch**:

  * Log risk level and rationale to tickets, so postmortems can validate whether classification was correct.

---

### 1.8 Platform-as-product and cognitive load boundaries

**Essence**

Team Topologies and related work stress *cognitive load management* as a design constraint: teams should own a coherent, manageable slice of the system; platforms should abstract away underlying complexity.([teamtopologies.com][1]) The same thinking applies to code modules and tooling.

**Problems they solve**

* Teams drowning in tools/infrastructure details.
* Platform teams acting as gatekeepers rather than product teams.
* Engineering “plumbing” overshadowing business features.

**How to integrate into kotef**

Artifacts:

* Add “cognitive load notes” to `architect_spec`:

  * which modules are considered high load,
  * which parts the platform is supposed to abstract.
* For each bounded context, define:

  * what external systems are “hidden” behind the platform.

Signals:

* Number of external systems a module touches.
* Variety of languages, frameworks, special-case scripts in an area.

Heuristics:

* **Planner**:

  * Avoid changes that increase cognitive load without strong justification (e.g., introducing new tech stack into a module).
* **Coder**:

  * Prefer reusing platform-provided capabilities instead of rolling bespoke solutions.
* **Snitch**:

  * Where cognitive load is high, add tech-debt items suggesting consolidation or new platform capabilities.

---

### 1.9 Agentic AI safety, guardrails, and evaluation

**Essence**

Recent work on agentic AI safety stresses layered defenses: prompt-level guardrails, tool permissioning, monitoring, red teaming, and systematic evaluation.([Skywork][15]) OWASP’s GenAI project (including an OWASP Top 10 for LLMs) highlights threats such as prompt injection, data exfiltration, and tool abuse in agentic systems.([OWASP Gen AI Security Project][16])

**Problems they solve**

* Prompt injection and tool misuse (e.g. unsafe commands, data leakage).
* Inconsistent refusal and guardrail behavior.
* Lack of structured evaluation of agent robustness.

**How to integrate into kotef**

Artifacts:

* “Agent risk profile” section in best-practices:

  * forbidden classes of actions (e.g., destructive commands),
  * sensitive tools requiring explicit justification.
* A red-teaming checklist for new tools or behaviors.

Signals:

* Nature of requested change (e.g., access to credentials, customer data, infra modifications).
* Patterns in prompts or goals that resemble risky behaviors.

Heuristics:

* **Planner**:

  * Maintain per-session risk state; escalate to requiring human approval for certain operations.
  * Recognize suspicious goals (“bypass auth,” “dump all user data”) and refuse.
* **Verifier**:

  * Include security/guardrail checks in “definition of done” for agent behavior itself: e.g., certain classes of prompts must be refused.
* **Snitch**:

  * Log “safety events”: refused actions, near-misses, red-team findings, and use them for tuning.

This makes kotef more robust as a tool-running agent, not just a coder.

---

## 2. Enhancement Modules for the Existing Kotef Algorithm

Instead of redefining the 10 phases, here are *overlay modules* you can insert or call from them.

### 2.1 Platform-awareness & golden-path selector

* **Used in**: Phase 1 (understand_goal), Phase 2 (analyze_system_state), Phase 3 (design_decide), Phase 4 (plan_work).
* **Goal**: Ensure every significant change either uses a golden path or records why not.

Inputs:

* Clarified goal, bounded context, available golden paths from `architect_spec`.

Outputs:

* `selected_golden_path` (or `none + deviation_reason`).
* Platform-aligned scaffolding steps in `work_plan`.

Key actions:

* Map goal to a known pattern (service, batch, job, migration).
* If match found:

  * attach platform template, expected observability, CI pattern.
* If no match:

  * create ADR entry “No golden path; candidate for future platform feature.”

Senior heuristics:

* Prefer golden paths, but allow deliberate deviations with explicit ADRs.
* Avoid mixing conflicting patterns (e.g., raw Kubernetes manifests in a context that uses platform templates).

### 2.2 Resilience & chaos overlay

* **Used in**: Phases 2 (analyze_system_state), 3 (design), 6 (verify), 10 (retro).
* **Goal**: Consider resilience and failure modes alongside functional behavior.

Inputs:

* Impact map, risk map, incident history, resilience notes.

Outputs:

* `resilience_risks`, `resilience_mitigations`, optional `chaos_experiment_suggestions`.

Key actions:

* Identify critical downstream dependencies and failure modes.
* For each, ask:

  * What happens if this dependency fails / is slow / returns partial data?
* Recommend:

  * timeouts, retries, fallback behavior, idempotency.
* Suggest chaos experiments to validate assumptions (non-prod).

Senior heuristics:

* Avoid sprinkling retries everywhere; place them at appropriate boundaries with backoff and limits.
* In retro, record “what would have made this change survive chaos tests”.

### 2.3 Security & supply chain overlay

* **Used in**: Phases 3 (design), 4 (plan_work), 5 (implement), 6 (verify), 8 (update_brain).
* **Goal**: Bring secure-by-design and supply chain security into the everyday workflow.

Inputs:

* Threat models, dependency metadata, CI/CD context.

Outputs:

* `security_risks`, updated `threat_model`, `security_controls_applied`.

Key actions:

* Classify change regarding security:

  * new dependency, new external integration, new auth path, etc.
* For higher-risk changes:

  * enforce threat modeling mini-step: STRIDE-like checklist for the component or pipeline.
* Encourage:

  * pinned dependencies, secure registries, SBOM generation.
* When relevant, add security ADR entries (“Why we trust this new architecture”).

Senior heuristics:

* Treat pipeline code as production code (protect CI secrets, agents, runners).
* Prefer denial-by-default for access control changes.

### 2.4 Data/ML reliability overlay

* **Used in**: Phases 1 (understand_goal), 3 (design), 5 (implement), 6 (verify).
* **Goal**: Make data contracts and ML lifecycle explicit.

Inputs:

* Data schemas, data contracts, ML model specs.

Outputs:

* `data_contract_changes`, `ml_eval_requirements`.

Key actions:

* Identify whether a change affects:

  * schemas, transformations, features, model inputs/outputs.
* For such changes:

  * enforce data contract diff and compatibility check.
  * recommend data validation tests and drift monitoring.
* For LLM/ML features:

  * describe evaluation method (offline tests, A/B, human eval).

Senior heuristics:

* Avoid “silent schema drift” – treat it as a breaking change that requires coordination.
* For LLM features, avoid shipping without *any* evaluation rubric, even if simple.

### 2.5 Collaboration & reviewability overlay

* **Used in**: Phases 4 (plan), 5 (implement), 8 (update_brain), 9 (prepare_integration).
* **Goal**: Structure output so humans can review efficiently.

Inputs:

* Work plan, diffs, risk score.

Outputs:

* `review_summary`, `review_focus_list`.

Key actions:

* Generate review-oriented summary:

  * what changed, why, where to look.
* Highlight:

  * non-obvious decisions,
  * risky parts,
  * sections that could benefit from pairing/mobbing.

Senior heuristics:

* Always assume a human reviewer will see a PR; make their job easier.
* For gnarly areas, explicitly recommend human pairing instead of full autonomy.

### 2.6 Agent-safety overlay

* **Used in**: all phases, but especially 1 (goal), 4 (plan), 5 (implement), 6 (verify), 10 (retro).
* **Goal**: Ensure the agent’s own operations remain within safe boundaries.

Inputs:

* Goal, tools list, org policies, OWASP GenAI-style risk guidance.

Outputs:

* `agent_risk_score`, `required_human_approval`, safety events.

Key actions:

* Classify each requested operation for safety risk:

  * access to production, sensitive data, dangerous commands.
* If high risk:

  * require human-in-the-loop (approval), or refuse.
* Log safety decisions and near-misses for future red-teaming.

Senior heuristics:

* Assume guardrails are imperfect; rely on defense-in-depth (limits, monitoring, approvals).
* Treat red-team findings as first-class inputs to best-practices and prompts.

---

## 3. Additional Senior Capabilities and How to Operationalize Them

These are capabilities not emphasized in the first report but important for a “true staff-like” agent.

### 3.1 Platform & product mindset

* **Essence**: Understands internal platforms as products, cares about DevEx and golden paths.
* **Operationalization**:

  * Brain: platform & golden-path catalog; platform SLOs for golden paths.
  * Nodes:

    * Planner: prefer platform capabilities over bespoke infra.
    * Snitch: record insights about where a new golden path is needed.

### 3.2 Security & compliance instinct

* **Essence**: Automatically considers security, privacy, supply-chain, and regulatory implications.
* **Operationalization**:

  * Brain: security baseline aligned with SLSA/OSPS, threat models per key system.
  * Nodes:

    * Planner: risk-based classification for security-sensitive changes.
    * Verifier: security scans/tests for those changes.
    * Snitch: record security-related decisions and assumptions.

### 3.3 Resilience & incident learning mindset

* **Essence**: Thinks in terms of resilience, not just averting single failures; uses incidents to update mental models.
* **Operationalization**:

  * Brain: resilience notes, incident summaries, chaos experiment catalog.
  * Nodes:

    * Verifier: propose resilience tests (timeouts, chaos) when budget permits.
    * Retro: always ask “what incident class would this change affect?” and “what did we learn”.

### 3.4 Data & ML literacy

* **Essence**: Treats data pipelines and models as first-class citizens with contracts, quality, and lifecycle.
* **Operationalization**:

  * Brain: data contracts, data products, model specs and metrics.
  * Nodes:

    * Planner: enforce schema and contract awareness.
    * Verifier: include data quality checks and ML evaluation where applicable.

### 3.5 Interfaces as products (API-first, DX-first)

* **Essence**: Sees APIs and events as products with consumers; values clarity, stability, and documentation.
* **Operationalization**:

  * Brain: API specs, usage notes, DX-focused best-practices (error messages, pagination, versioning).
  * Nodes:

    * Planner: require design-first for new/changed public APIs.
    * Snitch: ensure docs/specs are updated and examples are present.

### 3.6 Collaboration & social awareness

* **Essence**: Designs work so others can collaborate and review efficiently.
* **Operationalization**:

  * Brain: reviewability guidelines, pair/mob programming recommendations.
  * Nodes:

    * Coder: generate coherent diffs and review notes.
    * Snitch: update tickets with clear context for reviewers or future maintainers.

### 3.7 Operating within constraints and paved roads

* **Essence**: Works within organizational standards and constraints unless there is a strong reason not to.
* **Operationalization**:

  * Brain: explicit constraints (languages, frameworks, infra), golden paths, non-goals.
  * Nodes:

    * Planner: treat constraint violations as requiring ADRs and human approval.
    * Coder: avoid “tech tourism” (introducing new stacks without need).

---

## 4. Additional Reading / Search Terms

You can use these to further refine prompts and templates for kotef:

* Platform engineering, IDPs, golden paths, cognitive load

  * “Team Topologies platform engineering cognitive load”([teamtopologies.com][1])
  * “Internal developer platforms golden paths Backstage Port”([Platform Engineering][3])

* Resilience, Safety-II, chaos

  * “Safety-II and resilience engineering in software”([ResearchGate][5])
  * “Chaos Engineering 2.0 AI-driven policy guided experiments”([ResearchGate][6])

* Secure-by-design & supply chain

  * “SLSA software supply chain security”([SLSA][17])
  * “OSPS baseline OpenSSF project security controls”([Open Source Project Security Baseline][18])
  * “Threat modeling secure-by-design STRIDE CI/CD”([ResearchGate][8])

* Data/ML & MLOps

  * “Data mesh best practices 2025”([lakeFS][11])
  * “Data contracts zero-ETL data quality for ML pipelines”([ResearchGate][19])

* Docs-as-code and API-first

  * “API design-first OpenAPI AsyncAPI docs-as-code”([APIs You Won't Hate][4])

* Collaboration, reviews, pairing/mobbing

  * “Trunk-based development with pair programming and code review”([CodiLime][20])
  * “Benefits and challenges of pair and mob programming”([ResearchGate][14])

* Agentic AI safety & evaluation

  * “OWASP GenAI / OWASP Top 10 for LLMs”([OWASP Gen AI Security Project][16])
  * “Agentic AI security threats defenses evaluation”([Skywork][15])

All of these can feed into new sections in `project_spec`, `architect_spec`, `best_practices`, and into planner/researcher/coder/verifier/snitch prompts, giving kotef a much more “staff-like” posture across platform, security, resilience, data, and agent safety.

[1]: https://teamtopologies.com/platform-engineering "The ultimate goal of Platform Engineering is to accelerate ..."
[2]: https://platformengineering.org/blog/what-are-golden-paths-a-guide-to-streamlining-developer-workflows "What are golden paths? A guide to streamlining developer ..."
[3]: https://platformengineering.com/features/backstage-1-43-when-internal-developer-platforms-start-acting-like-platforms/ "Backstage 1.43: When Internal Developer Platforms Start ..."
[4]: https://apisyouwonthate.com/blog/a-developers-guide-to-api-design-first/ "A Developer's Guide to API Design-First"
[5]: https://www.researchgate.net/publication/347450313_Safety-II_and_Resilience_Engineering_in_a_Nutshell_An_Introductory_Guide_to_Their_Concepts_and_Methods "(PDF) Safety-II and Resilience Engineering in a Nutshell"
[6]: https://www.researchgate.net/publication/393888322_Resilience_Engineering_in_DevOps_Fault_Injection_and_Chaos_Testing_for_Distributed_Systems "Resilience Engineering in DevOps: Fault Injection and ..."
[7]: https://www.conf42.com/Chaos_Engineering_2021_Julie_Gunderson_postmortem_continuous_learning_blameless_culture "Postmortems, Continuous Learning and Enabling ..."
[8]: https://www.researchgate.net/publication/392530739_Enhancing_Software_Supply_Chain_Security_Through_STRIDE-Based_Threat_Modelling_of_CICD_Pipelines "(PDF) Enhancing Software Supply Chain Security Through ..."
[9]: https://www.ox.security/blog/the-role-of-threat-modeling-in-secure-by-design/ "The Role of Threat Modeling in Secure by Design"
[10]: https://arxiv.org/html/2509.08083v1 "Establishing a Baseline of Software Supply Chain Security ..."
[11]: https://lakefs.io/blog/data-mesh-tools/ "Top Data Mesh Tools: Key Features & Examples"
[12]: https://www.openlabsresearch.com/si/blog/scalable-ai-mlops "MLOps 2025: Best Practices for Enterprise AI at Scale"
[13]: https://dev.to/hsmall/how-to-implement-trunk-based-development-a-practical-guide-56e7 "How to Implement Trunk-Based Development: A Practical ..."
[14]: https://www.researchgate.net/publication/222594980_Pair_programming_in_software_development_teams_-_An_empirical_study_of_its_benefits "Pair programming in software development teams"
[15]: https://skywork.ai/blog/agentic-ai-safety-best-practices-2025-enterprise/ "Safety & Guardrails for Agentic AI Systems (2025)"
[16]: https://genai.owasp.org/ "Home - OWASP Gen AI Security Project"
[17]: https://slsa.dev/ "SLSA • Supply-chain Levels for Software Artifacts"
[18]: https://baseline.openssf.org/versions/2025-10-10.html "Version - Open Source Project Security Baseline"
[19]: https://www.researchgate.net/publication/395100809_AI-Ready_Data_Infrastructure_A_Review_of_Zero-ETL_Declarative_Pipelines_and_Data_Contracts_in_Modern_Data_Engineering "A Review of Zero-ETL, Declarative Pipelines, and Data ..."
[20]: https://codilime.com/blog/trunk-based-development/ "Trunk-based development - everything you need to know"
