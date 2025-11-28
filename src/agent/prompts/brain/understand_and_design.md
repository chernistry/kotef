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

### Required Sections (MUST include these exact headers):
- `# Best Practices & Research`
- `## 1. TL;DR` — ≤10 bullets: key decisions, trade-offs, what changed in {{YEAR}}
- `## 2. Landscape` — What's new in {{YEAR}} for {{TECH_STACK}}
- `## 3. Architecture Patterns` — 2-3 patterns for {{DOMAIN}}
- `## 4. Conflicting Practices & Alternatives` — Areas where sources disagree
- `## 5. References` — Sources with URLs

---

## Part 2: Architecture Specification

Based on the best practices above, produce an implementation-ready architecture spec.

### Operating Principles:
- Clarity first: plan → solution with brief reasoning
- MVP focus: minimal-sufficient solution; note scale-up path
- Verification: include tests/validators
- Security: least privilege, secrets store
- Reliability: idempotency, retries, timeouts

### Required Sections (MUST include these exact headers):
- `# Architect Specification`
- `## Hard Constraints` — Domain prohibitions, compliance, tech restrictions
- `## Goals & Non-Goals` — 1-5 each, linked to Definition of Done
- `## Metric Profile & Strategic Risk Map` — Weights and 3-7 risks
- `## MVP Recommendation` — Choice, rationale, scale-up path
- `## Architecture Overview` — Diagram (text), data schema, integrations
- `## Components` — Component A, B, etc. with responsibilities
- `## Code Standards & Conventions` — Language, testing, security, observability
- `## Commands` — Format, lint, test, build, typecheck commands
- `## Implementation Steps` — Numbered plan with function signatures
- `## Backlog (Tickets)` — Brief list of tickets to create (filename, title, summary)

---

## Quality Checklist

Before outputting, verify:
- [ ] Both documents have all required sections
- [ ] Best practices are specific to {{TECH_STACK}}, not generic
- [ ] Architecture references best practices decisions
- [ ] Backlog tickets are ordered by dependency
- [ ] No placeholder text like "[TODO]" or "[FILL IN]"
