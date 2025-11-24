# Architect Prompt Template

Instruction for AI: based on the project description and best practices, prepare an implementation‑ready architecture specification.

Context:
- Project: {{PROJECT_NAME}}
- Description: {{PROJECT_DESCRIPTION_CONTENT}}
- Domain: {{DOMAIN}}
- Tech stack: {{TECH_STACK}}
- Year: {{YEAR}}
- Best practices: see `.sdd/best_practices.md`
- Definition of Done: see `.sdd/project.md` (section “Definition of Done”)

Operating Principles:
- Clarity first: plan → solution with brief, checkable reasoning
- MVP focus: pick minimal-sufficient solution; note scale-up path
- Verification: include tests/samples/validators
- Security: least privilege, use stack's secrets store
- Reliability: idempotency, retries with backoff+jitter, timeouts
- Cost/latency: budgets and caps; avoid over-engineering
- DoD alignment: architecture and tickets must satisfy the Definition of Done from `.sdd/project.md`.

Task:
Produce architect.md as the source of truth for implementation.

Output Structure (Markdown):
## Hard Constraints (if applicable)
- Domain-specific prohibitions (e.g., no heuristics, no regex parsers, tool-first grounding)
- Compliance requirements (GDPR, accessibility, security standards)
- Technology restrictions (no external dependencies, offline-first, etc.)

## Go/No-Go Preconditions
- Blocking prerequisites before implementation starts
- Required secrets, API keys, credentials, licenses
- Environment setup, corpora, test data availability
- Dependency readiness (external services, databases)
## Goals & Non‑Goals
- Goals: [1–5]
- Non‑Goals: [1–5]
- Link goals explicitly to the Definition of Done from `.sdd/project.md` (what must be true at release).

## Metric Profile & Strategic Risk Map
- Define a simple metric profile for this project (PerfGain, SecRisk, DevTime, Maintainability, Cost, Scalability, DX) with indicative relative weights (e.g., SecRisk 0.4, PerfGain 0.2, Cost 0.1, …).
- Summarize 3–7 strategic risks (e.g., security, test coverage, vendor lock‑in, data loss, latency/cost overruns) with High/Medium/Low ratings.
- Note how this profile should influence architecture choices (e.g., prioritize safety and maintainability in high‑risk areas even at the expense of local performance).

## Alternatives (2–3)
- A) [Name]: when to use; pros/cons; constraints
- B) [Name]: when to use; pros/cons; constraints
- C) [Optional]

## Research Conflicts & Resolutions
- Summarize key conflicting practices from `.sdd/best_practices.md` (section “Conflicting Practices & Alternatives”), including options and trade‑offs.
- For each conflict, record:
  - The chosen option and why (using the Metric Profile and project constraints/Definition of Done).
  - Links to detailed ADR entries (e.g., [ADR‑00X]).
  - Implications for components, data model, and quality attributes.

## MVP Recommendation
- MVP choice and why; scale‑up path; rollback plan

## Architecture Overview
- Diagram (text): components and connections
- Data schema (high‑level)
- External integrations

## Discovery (optional, if a repo is available)
- Map structure, entry points, integration boundaries, and cross‑cutting concerns.
- Identify dead code, high‑complexity modules, and extension points (minimal change surface).
- Output a short tree of key files and where your plan plugs in.

**Example Project Structure (if helpful):**
```
project/
├── src/
│   ├── core/
│   ├── api/
│   └── utils/
├── tests/
└── docs/
```

## MCDM for Major Choices
- Criteria: PerfGain, SecRisk, DevTime, Maintainability, Cost, Scalability, DX
- Weights: justify briefly (SMART/BWM)
- Alternatives table: scores 1–9 → normalize → TOPSIS rank
- Recommendation: pick highest closeness; note trade‑offs and rollback plan

### Decision Matrix (template)
| Alternative | PerfGain | SecRisk | DevTime | Maintainability | Cost | Scalability | DX | Notes |
|-------------|----------|---------|---------|-----------------|------|------------|----|-------|
| A           |          |         |         |                 |      |            |    |       |
| B           |          |         |         |                 |      |            |    |       |
| C           |          |         |         |                 |      |            |    |       |

## Key Decisions (ADR‑style)
- [ADR‑001] Choice with rationale (alternatives, trade‑offs)
- [ADR‑002] ...

## Components
- Component A: responsibility, interfaces, dependencies; typical flows and 3–10 key edge cases.
- Component B: ...
- For large projects, group components into domains (e.g., `.sdd/architecture/components/<area>.md`) and keep this section as a high‑level index.

## Code Standards & Conventions
### Language & Style
- Language and framework versions (LTS where possible).
- Linters/formatters (tools, config files, CI integration).
- Naming conventions (files, modules, classes, functions, tests).
- Typing rules (strictness level, `mypy`/TS config, nullability).

### Framework & Project Layout
- Folder/module conventions; separation of concerns.
- Environment configs for dev/stage/prod and local overrides.
- Where to put domain logic, adapters, scripts, and infra code.

### API & Contracts
- REST/GraphQL/gRPC style; pagination, filtering, error shapes.
- Versioning strategy (URLs/headers/schemas) and deprecation policy.
- Input/output validation (schemas, DTOs, serializers).

### Testing
- Coverage targets; required libraries and fixtures.
- Unit/Integration/E2E/Perf/Security testing strategy.
- When to stub/mocking vs. use real dependencies.

### Security
- AuthN/AuthZ patterns; scopes/roles.
- Secrets management (env vars/secret stores, never in code/logs).
- Dependency hygiene (SCA, pinning, update cadence).
- PII handling; data minimization and retention.
- SSRF/input validation/signature verification; allowlists for external domains/APIs.

### Resilience
- Explicit timeouts on all external calls (network, DB, APIs).
- Retry policies with exponential backoff + jitter, max attempts.
- Circuit breakers for fragile integrations; graceful degradation.
- Rate limiting (per-user/per-endpoint) and quotas.
- Idempotency keys for side-effects and background jobs.

### Observability
- Metrics/logs/traces; alerts and dashboards.
- Structured logging (JSON, no secrets) with correlation IDs.
- Health endpoints (e.g. `/healthz`, `/metrics`).
- Performance budgets and monitoring; key SLIs/SLOs.

### Performance & Cost
- Perf targets and cost budgets for critical paths.
- Profiling strategy and tools; when to optimize.

### Git & PR Process
- Branching model; commit style.
- Review checklists and required approvals.

### Tooling
- Formatters, linters, type checkers, security scanners.
- Pre-commit hooks and CI steps.

### Commands
Provide concrete commands for common tasks (adapt to {{TECH_STACK}}):
```bash
# Format code
<format-command>

# Lint
<lint-command>

# Run tests
<test-command>

# Build
<build-command>

# Type check
<typecheck-command>
```

### Anti-Patterns (Do NOT do this)
- No timeouts/retries on external calls.
- Hardcoded secrets, URLs, or configuration.
- Silent error swallowing (empty catch blocks).
- Print statements instead of structured logging.
- Missing tests for critical paths.
- No idempotency for side-effects.
- Mutable global state and circular dependencies.
- Files >400 LOC without clear separation of concerns.

### Configuration-Driven Policy
- All thresholds, limits, and environment-specific values must be configurable.
- Use environment variables or config files (never hardcode).
- Document configuration options with defaults and valid ranges.
- Validate configuration on startup.

### File Creation Policy
- Prefer in-memory operations and existing modules.
- Create new files only for substantial, reusable functionality.
- Organize by purpose (scripts/tests/utils).
- Avoid file sprawl; split large files with distinct responsibilities.

## API Contracts
- Endpoint/Function → contract (input/output, errors)
- Versioning and compatibility

## Data Model
- Models/tables: fields, keys, indexes
- Migration policies

## Quality & Operations
- Testing strategy (unit/integration/e2e/perf/security)
- Observability (metrics/logs/traces, alerts)
- Security (authn/authz, secrets, data protection)
- CI/CD (pipeline, gates, rollbacks)

## Deployment & Platform Readiness
- Target platform specifics (Lambda cold-start, container size, etc.)
- Resource constraints (memory, CPU, timeout limits)
- Bundling strategy, lazy imports, optimization
- Platform-specific packaging notes

## Verification Strategy
- When and how to verify outputs (before/after persistence)
- Verification artifacts and storage
- Auto-verification triggers and conditions
- Provenance and citation requirements

## Domain Doctrine & Grounding (optional)
- Grounding sources (DBs/APIs/files) and how to cite/verify.
- Policies & prohibitions (e.g., no heuristics for routing, scraping doctrine, robots/ToS).
- Receipts/verification discipline and provenance requirements.

## Affected Modules/Files (if repo is available)
- Files to modify → short rationale.
- Files to create → paths, responsibilities, and initial signatures.

## Technical Debt & Refactoring Backlog
- List known or expected areas of technical debt (by component/file).
- Define principles for when to create a dedicated “janitor” ticket vs. opportunistic refactoring.
- Provide 3–10 initial refactoring/cleanup tickets with priorities and rough scope.

## Implementation Steps
- Numbered, observable plan with concrete function names and signatures.
- Include timeouts, retries, validation, and error shapes.

## Backlog (Tickets)
- Break the work into tickets with clear dependencies and Definition of Done alignment.
- File structure: `.sdd/backlog/tickets/open/<nn>-<kebab>.md`
- Ticket format (each file, strongly recommended):
  - Header: `# Ticket: <nn> <short-title>`
  - Spec version: reference to this document (e.g., `Spec version: vX.Y` or commit/ADR).
  - Context: links to relevant sections in this spec (components, ADR, API contracts, quality standards).
  - Objective & DoD: what must be true when this ticket is “Done”.
  - Steps: 3–10 concrete, observable steps.
  - Affected files/modules: explicit list or patterns.
  - Tests: specific test cases and commands to run.
  - Risks & Edge Cases: known risks and important edge cases to cover.
  - Dependencies: upstream/downstream tickets.
- For recurring refactor/cleanup work, create dedicated “janitor” tickets and keep them small and focused.

## Interfaces & Contracts
- API endpoints/functions: input/output schemas, error shapes, versioning.
- Compatibility strategy and migration notes.

## Stop Rules & Preconditions
- Go/No‑Go prerequisites (secrets, corpora, env flags, licenses).
- Conditions to halt and escalate (security/compliance conflicts, blocked dependencies).

## Open Issues from Implementation
- Summarize issues reported by the Implementing Agent in `.sdd/issues.md` (conflicts, missing decisions, unclear tickets).
- For each issue, decide whether to:
  - Update this specification (and record an ADR if it is a decision).
  - Update or close the corresponding ticket(s).
  - Defer as technical debt (and create a janitor ticket).

## SLOs & Guardrails
- SLOs: latency/throughput/error rate
- Performance/Cost budgets and limits

## Implementation Checklist (adapt to project)
- [ ] All external calls have timeouts and retry policies
- [ ] Error handling covers expected failure modes
- [ ] Tests cover critical paths and edge cases
- [ ] Security requirements addressed (secrets, validation, auth)
- [ ] Observability in place (logs, metrics, traces)
- [ ] Documentation updated (API contracts, deployment notes)

## Hidden Quality Loop (internal, do not include in output)
PE2/Chain‑of‑Verification self-check (≤3 iterations):
1. Diagnose: compare the spec against Hard Constraints, Metric Profile & Strategic Risk Map, SLOs, and best_practices; identify up to 3 concrete weaknesses (missing tests/contracts, risky assumptions, perf/security gaps).
2. Refine: make minimal, surgical edits (≤60 words per iteration) to address these weaknesses without changing the overall structure.
3. Stop when saturated or when further changes would add complexity without clear benefit.

Requirements
1) No chain‑of‑thought. Provide final decisions with brief, verifiable reasoning.
2) Be specific to {{TECH_STACK}} and up‑to‑date for {{YEAR}}; flag outdated items.
