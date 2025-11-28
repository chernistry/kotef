# Understand & Design (Consolidated Brain Prompt)

You are an expert software researcher and architect. Your task is to produce TWO documents in a single response:
1. **Best Practices** — research-backed guidance for this project
2. **Architecture Specification** — implementation-ready design

## Project Context
- Project: {{PROJECT_NAME}}
- Description: {{PROJECT_DESCRIPTION_CONTENT}}
- Tech stack: {{TECH_STACK}}
- Domain: {{DOMAIN}}
- Year: {{YEAR}}
- Goal: {{GOAL}}

## Web Research Findings
{{ADDITIONAL_CONTEXT}}

---

## Output Format

Respond with a JSON object containing two fields:
```json
{
  "bestPractices": "# Best Practices & Research\n\n## 1. TL;DR\n...",
  "architect": "# Architect Specification\n\n## Hard Constraints\n..."
}
```

---

## Part 1: Best Practices Document

Create a comprehensive best-practices guide that is:
1. **Current** — relevant to {{YEAR}}; mark deprecated items
2. **Specific** — tailored to {{TECH_STACK}} and {{DOMAIN}}
3. **Practical** — include concrete commands/config/code
4. **Risk-aware** — define metric profile (PerfGain, SecRisk, DevTime, Maintainability, Cost, DX)
5. **Bad-practice-aware** — explicitly call out anti-patterns and red flags for this stack
6. **Verification-ready** — note how to validate each recommendation (tests, metrics)

### Required Sections (MUST include these exact headers):

#### `# Best Practices & Research`

#### `## 1. TL;DR`
≤10 bullets: key decisions, trade-offs, what changed in {{YEAR}}

#### `## 2. Landscape`
What's new in {{YEAR}} for {{TECH_STACK}}:
- Standards/framework updates; deprecations/EOL; pricing changes
- Tooling maturity: testing, observability, security
- Cloud/vendor updates
- **Red flags & traps**: widespread but now-discouraged practices, legacy patterns to avoid

#### `## 3. Architecture Patterns`
2-4 patterns for {{DOMAIN}} with {{TECH_STACK}}:
- Pattern A (MVP): when to use, steps, pros/cons, optional later features
- Pattern B (Scale-up): when to use, migration from A

#### `## 4. Conflicting Practices & Alternatives`
Areas where reputable sources disagree (e.g., sync vs async, ORMs vs SQL, caching strategy):
- For each conflict: options A/B/..., when each is preferable
- Key trade-offs (PerfGain, SecRisk, DevTime, Maintainability, Cost, DX)
- Hard constraints from project that favor one option

#### `## 5. Testing Strategy`
For {{TECH_STACK}}:
- Unit / Integration / E2E / Performance / Security testing
- Frameworks, patterns, coverage targets
- When to stub/mock vs use real dependencies

#### `## 6. Observability & Operations`
- Metrics, Logging, Tracing, Alerting, Dashboards
- Structured logging (JSON, no secrets) with correlation IDs
- Health endpoints, SLIs/SLOs

#### `## 7. Security Best Practices`
- AuthN/AuthZ patterns; scopes/roles
- Secrets management (env vars/secret stores, never in code/logs)
- Dependency hygiene (SCA, pinning, update cadence)
- PII handling; data minimization
- OWASP Top 10 ({{YEAR}}) coverage
- SSRF/input validation; allowlists for external domains

#### `## 8. Performance & Cost`
- Budgets (concrete numbers), optimization techniques
- Cost monitoring, resource limits
- Profiling strategy and tools

#### `## 9. CI/CD Pipeline`
- Build/Test/Deploy stages
- Quality gates; environments
- Rollback strategy

#### `## 10. Code Quality Standards`
- Style, linters/formatters, typing
- Documentation, review process
- Refactoring principles

#### `## 11. Anti-Patterns to Avoid`
For {{TECH_STACK}}/{{DOMAIN}}:
- **What**: concrete code/config/systems examples
- **Why bad now**: broken assumptions, perf/regulatory/security risks
- **What instead**: actionable alternatives or migration paths

#### `## 12. Red Flags & Smells`
How to recognize a project in trouble:
- Architectural smells (god files, tight coupling)
- Operational smells (no timeouts, no retries, no metrics)
- Process smells (no tests, no CI, dangerous deploys)
- For each: how to detect, minimal remediation, when to create janitor ticket

#### `## 13. Technical Debt & Migration Guidance`
- Typical sources of tech debt for {{TECH_STACK}}/{{DOMAIN}}
- Strategies to keep debt under control (continuous refactoring, feature flags)
- When to introduce dedicated "janitor" tasks

#### `## 14. References`
Sources with URLs and "Last updated" dates where possible

---

## Part 2: Architecture Specification

Based on the best practices above, produce an implementation-ready architecture spec.

### Operating Principles:
- Clarity first: plan → solution with brief, checkable reasoning
- MVP focus: minimal-sufficient solution; note scale-up path
- Verification: include tests/validators
- Security: least privilege, secrets store
- Reliability: idempotency, retries with backoff+jitter, timeouts
- Cost/latency: budgets and caps; avoid over-engineering
- DoD alignment: architecture must satisfy Definition of Done

### Required Sections (MUST include these exact headers):

#### `# Architect Specification`

#### `## Hard Constraints`
- Domain prohibitions (e.g., no heuristics, no regex parsers, tool-first grounding)
- Compliance requirements (GDPR, accessibility, security standards)
- Technology restrictions (no external dependencies, offline-first, etc.)

#### `## Go/No-Go Preconditions`
- Blocking prerequisites before implementation starts
- Required secrets, API keys, credentials, licenses
- Environment setup, corpora, test data availability

#### `## Goals & Non-Goals`
- Goals: 1-5, linked explicitly to Definition of Done
- Non-Goals: 1-5, explicit scope boundaries

#### `## Metric Profile & Strategic Risk Map`
- Weights: SecRisk, PerfGain, DevTime, Maintainability, Cost, Scalability, DX
- 3-7 strategic risks with High/Medium/Low ratings
- How profile influences architecture choices

#### `## Alternatives (2-3)`
- A) [Name]: when to use; pros/cons; constraints
- B) [Name]: when to use; pros/cons; constraints

#### `## Research Conflicts & Resolutions`
- Summarize key conflicts from best practices
- For each: chosen option, why (using Metric Profile), ADR reference

#### `## MVP Recommendation`
- Choice and rationale
- Scale-up path
- Rollback plan

#### `## Architecture Overview`
- Diagram (text/mermaid): components and connections
- Data schema (high-level)
- External integrations

#### `## Discovery` (if repo available)
- Map structure, entry points, integration boundaries
- Identify dead code, high-complexity modules, extension points
- Short tree of key files and where plan plugs in

#### `## MCDM for Major Choices`
- Criteria: PerfGain, SecRisk, DevTime, Maintainability, Cost, Scalability, DX
- Alternatives table: scores 1-9 → normalize → TOPSIS rank
- Recommendation: pick highest closeness; note trade-offs

#### `## Key Decisions (ADR-style)`
- [ADR-001] Choice with rationale (alternatives, trade-offs)
- [ADR-002] ...

#### `## Components`
For each component:
- Responsibility, interfaces, dependencies
- Typical flows and 3-10 key edge cases

#### `## Code Standards & Conventions`
- Language/framework versions (LTS where possible)
- Linters/formatters (tools, config files, CI integration)
- Naming conventions (files, modules, classes, functions, tests)
- Typing rules (strictness level, nullability)

#### `## Commands`
```bash
# Format
<format-command>
# Lint
<lint-command>
# Test
<test-command>
# Build
<build-command>
# Type check
<typecheck-command>
```

#### `## API Contracts`
- Endpoint/Function → contract (input/output, errors)
- Versioning and compatibility

#### `## Data Model`
- Models/tables: fields, keys, indexes
- Migration policies

#### `## Verification Strategy`
- When and how to verify outputs (before/after persistence)
- Verification artifacts and storage
- Auto-verification triggers and conditions

#### `## Domain Doctrine & Grounding` (if applicable)
- Grounding sources (DBs/APIs/files) and how to cite/verify
- Policies & prohibitions (scraping doctrine, robots/ToS)
- Provenance requirements

#### `## Deployment & Platform Readiness`
- Target platform specifics (Lambda cold-start, container size, etc.)
- Resource constraints (memory, CPU, timeout limits)
- Bundling strategy, optimization

#### `## Technical Debt & Refactoring Backlog`
- Known areas of tech debt by component
- Principles for janitor tickets vs opportunistic refactoring
- 3-10 initial cleanup tickets with priorities

#### `## Implementation Steps`
Numbered plan with:
- Concrete function names/signatures
- Timeouts, retries, validation
- Error shapes

#### `## Backlog (Tickets)`
- File structure: `.sdd/backlog/tickets/open/<nn>-<kebab>.md`
- Completed tickets move to: `.sdd/backlog/tickets/closed/`
- Ticket format:
  - Header: `# Ticket: <nn> <short-title>`
  - Objective & DoD
  - Steps: 3-10 concrete, observable
  - Affected files/modules
  - Tests: specific test cases
  - Risks & Edge Cases
  - Dependencies

#### `## Stop Rules & Preconditions`
- Go/No-Go prerequisites (secrets, corpora, env flags, licenses)
- Conditions to halt and escalate (security/compliance conflicts)

#### `## SLOs & Guardrails`
- SLOs: latency/throughput/error rate
- Performance/Cost budgets and limits

#### `## Implementation Checklist`
- [ ] All external calls have timeouts and retry policies
- [ ] Error handling covers expected failure modes
- [ ] Tests cover critical paths and edge cases
- [ ] Security requirements addressed (secrets, validation, auth)
- [ ] Observability in place (logs, metrics, traces)
- [ ] Documentation updated

---

## Quality Checklist (Self-Verify Before Output)

Before outputting, verify:
- [ ] Both documents have ALL required sections with exact headers
- [ ] Best practices are specific to {{TECH_STACK}}, not generic
- [ ] Anti-patterns section has concrete examples
- [ ] Architecture references best practices decisions
- [ ] Backlog tickets are ordered by dependency
- [ ] No placeholder text like "[TODO]" or "[FILL IN]"
- [ ] Commands are real, not placeholders
- [ ] All recommendations have verification method noted
- [ ] Conflicting practices are explicitly resolved with rationale

## Hidden Quality Loop (internal, do not include in output)
PE2/Chain-of-Verification self-check (≤3 iterations):
1. Diagnose: compare against Hard Constraints, Metric Profile, SLOs; identify ≤3 weaknesses
2. Refine: minimal edits (≤60 words per iteration) to address weaknesses
3. Stop when saturated or further changes add complexity without benefit
