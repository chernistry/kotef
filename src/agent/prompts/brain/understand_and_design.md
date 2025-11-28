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
- Standards/framework updates; deprecations/EOL
- Tooling maturity: testing, observability, security
- **Red flags & traps**: widespread but now-discouraged practices

#### `## 3. Architecture Patterns`
2-3 patterns for {{DOMAIN}}:
- Pattern A (MVP): when to use, steps, pros/cons
- Pattern B (Scale-up): when to use, migration from A

#### `## 4. Conflicting Practices & Alternatives`
Areas where sources disagree:
- For each conflict: options, when each is preferable, trade-offs
- Hard constraints from project that favor one option

#### `## 5. Anti-Patterns to Avoid`
For {{TECH_STACK}}/{{DOMAIN}}:
- **What**: concrete code/config examples
- **Why bad now**: broken assumptions, risks
- **What instead**: actionable alternatives

#### `## 6. References`
Sources with URLs and dates

---

## Part 2: Architecture Specification

Based on the best practices above, produce an implementation-ready architecture spec.

### Operating Principles:
- Clarity first: plan → solution with brief reasoning
- MVP focus: minimal-sufficient solution; note scale-up path
- Verification: include tests/validators
- Security: least privilege, secrets store
- Reliability: idempotency, retries with backoff+jitter, timeouts
- DoD alignment: architecture must satisfy Definition of Done

### Required Sections (MUST include these exact headers):

#### `# Architect Specification`

#### `## Hard Constraints`
- Domain prohibitions, compliance, tech restrictions
- Go/No-Go preconditions (secrets, APIs, env setup)

#### `## Goals & Non-Goals`
- Goals: 1-5, linked to Definition of Done
- Non-Goals: 1-5, explicit scope boundaries

#### `## Metric Profile & Strategic Risk Map`
- Weights: SecRisk, PerfGain, DevTime, Maintainability, Cost, DX
- 3-7 strategic risks with High/Medium/Low ratings
- How profile influences architecture choices

#### `## MVP Recommendation`
- Choice and rationale
- Scale-up path
- Rollback plan

#### `## Architecture Overview`
- Diagram (text/mermaid): components and connections
- Data schema (high-level)
- External integrations

#### `## Components`
For each component:
- Responsibility
- Interfaces
- Dependencies
- Key edge cases (3-10)

#### `## Code Standards & Conventions`
- Language/framework versions
- Linters/formatters
- Testing strategy (unit/integration/e2e)
- Security (secrets, validation, auth)
- Observability (logs, metrics, traces)

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
```

#### `## Key Decisions (ADR-style)`
- [ADR-001] Choice with rationale (alternatives, trade-offs)
- [ADR-002] ...

#### `## Implementation Steps`
Numbered plan with:
- Concrete function names/signatures
- Timeouts, retries, validation
- Error shapes

#### `## Backlog (Tickets)`
Brief list of tickets to create:
- `01-setup.md` — Project scaffolding
- `02-core.md` — Core functionality
- etc.

---

## Quality Checklist

Before outputting, verify:
- [ ] Both documents have ALL required sections with exact headers
- [ ] Best practices are specific to {{TECH_STACK}}, not generic
- [ ] Anti-patterns section has concrete examples
- [ ] Architecture references best practices decisions
- [ ] Backlog tickets are ordered by dependency
- [ ] No placeholder text like "[TODO]" or "[FILL IN]"
- [ ] Commands are real, not placeholders
