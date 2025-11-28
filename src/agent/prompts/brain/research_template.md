# Best Practices Research Template (Improved)

Instruction for AI: produce a practical, evidence‑backed best practices guide tailored to this project and stack.

---

## Project Context
- Project: {{PROJECT_NAME}}
- Description: {{PROJECT_DESCRIPTION_CONTENT}}
- Tech stack: {{TECH_STACK}}
- Domain: {{DOMAIN}}
- Year: {{YEAR}}

## Task
Create a comprehensive best‑practices guide for {{PROJECT_NAME}} that is:
1) Current — relevant to {{YEAR}}; mark deprecated/outdated items.
2) Specific — tailored to {{TECH_STACK}} and {{DOMAIN}}.
3) Practical — include concrete commands/config/code.
4) Complete — cover architecture, quality, ops, security, and technical debt.
5) Risk‑aware — define a simple metric profile (PerfGain, SecRisk, DevTime, Maintainability, Cost, DX) with indicative weights for this project, plus 3–5 key risks with High/Medium/Low labels.
6) Conflict‑aware — explicitly call out conflicting or mutually exclusive practices and alternative patterns.
7) **Bad‑practice‑aware** — explicitly search for **common bad practices, anti‑patterns, and red flags** for this stack/domain, and describe:
   - how they typically show up in real code/built systems,
   - why they are harmful now ({{YEAR}}),
   - what to do instead or how to migrate away from them.
8) Verification‑ready — for each major recommendation (and “don’t do this”), note how to validate it (tests, metrics, experiments) so the architect/agent can reuse these checks.

## Validation Checklist (CRITICAL)
You MUST include the following headers exactly as written (case-insensitive):
- `# Best Practices & Research`
- `## 1. TL;DR`
- `## 2. Landscape`
- `## 3. Architecture Patterns`
- `## 4. Conflicting Practices & Alternatives`
- `## 5. References`
If you miss any of these, the system will reject your output.

## Output Structure (Markdown)
### 1. TL;DR (≤10 bullets)
- Key decisions and patterns (why, trade‑offs, MVP vs later)
- Observability posture; Security posture; CI/CD; Performance & Cost guardrails
- What changed in {{YEAR}}; SLOs summary

### 2. Landscape — What’s new in {{YEAR}}
For {{TECH_STACK}}:
- Standards/framework updates; deprecations/EOL; pricing changes
- Tooling maturity: testing, observability, security
- Cloud/vendor updates
- Alternative approaches and when to choose them
- **Red flags & traps**:
  - widespread but now‑discouraged practices (e.g., patterns that conflict with current security/scale/maintainability expectations),
  - legacy patterns people still copy from old blog posts that should be avoided in new code.

## 3. Architecture Patterns (2–4 for {{DOMAIN}} with {{TECH_STACK}})
Pattern A — [NAME] (MVP)
- When to use; Steps; Pros/Cons; Optional later features

Pattern B — [NAME] (Scale‑up)
- When to use; Migration from A

## 4. Conflicting Practices & Alternatives
- List concrete areas where reputable sources disagree (e.g., sync vs async I/O, ORMs vs SQL, service boundaries, caching strategy).
- For each conflict, summarize:
  - Options (A/B/…)
  - When each is preferable (context/scale/risk profile)
  - Key trade‑offs and risks (PerfGain, SecRisk, DevTime, Maintainability, Cost, DX)
  - Any hard constraints from the project description (Definition of Done, compliance, budgets) that favor one option.

### 4. Priority 1 — [AREA]
Why → relation to goals and mitigated risks
Scope → In/Out
Decisions → with rationale and alternatives
Implementation outline → 3–6 concrete steps
Guardrails & SLOs → metrics and limits/quotas
Failure Modes & Recovery → detection→remediation→rollback

### 5–6. Priority 2/3 — [AREA]
Repeat the structure from 4.

### 7. Testing Strategy (for {{TECH_STACK}})
- Unit / Integration / E2E / Performance / Security
- Frameworks, patterns, coverage targets

### 8. Observability & Operations
- Metrics, Logging, Tracing, Alerting, Dashboards

### 9. Security Best Practices
- AuthN/AuthZ, Data protection (PII, encryption), Secrets, Dependency security
- OWASP Top 10 ({{YEAR}}) coverage; Compliance (if any)

### 10. Performance & Cost
- Budgets (concrete numbers), optimization techniques, cost monitoring, resource limits

### 11. CI/CD Pipeline
- Build/Test/Deploy; quality gates; environments

### 12. Code Quality Standards
- Style, linters/formatters, typing, docs, review, refactoring

### 13. Reading List (with dates and gists)
- [Source] (Last updated: YYYY‑MM‑DD) — gist

### 14. Decision Log (ADR style)
- [ADR‑001] [Choice] over [alternatives] because [reason]

### 15. Anti‑Patterns to Avoid
- For {{TECH_STACK}}/{{DOMAIN}} list specific anti‑patterns with:
  - **What** (concrete code/config/systems examples),
  - **Why bad now** (broken assumptions, perf/regulatory/security risks, maintenance pain),
  - **What instead** (actionable alternatives or migration paths).

### 16. Red Flags & Smells in Existing Projects
- How to recognize that {{PROJECT_NAME}} (or a similar project) is in trouble:
  - architectural smells (e.g., unbounded growth of “god files”, tight coupling around certain modules),
  - operational smells (no timeouts, no retries, no metrics/logs),
  - process smells (no tests around critical paths, no CI, dangerous deploy patterns).
- For each red flag, include:
  - how to detect it (queries, metrics, code searches),
  - what minimal remediation looks like,
  - how an agent like kotef should treat it (e.g., when to create a separate “janitor” ticket).

## 5. References
- List sources inline near claims; add links; include “Last updated” dates when possible.

### 18. Verification
- Self‑check: how to validate key recommendations (scripts, smoke tests, benchmarks)
- Confidence: [High/Medium/Low] per section

### 19. Technical Debt & Migration Guidance
- Typical sources of technical debt for {{TECH_STACK}}/{{DOMAIN}}.
- Recommended strategies to keep debt under control over time (continuous refactoring, migration paths, feature flags).
- When to introduce dedicated “janitor” tasks and what they should look like.

## Requirements
1) No chain‑of‑thought. Provide final answers with short, verifiable reasoning.
2) If browsing is needed, state what to check and why; produce a provisional answer with TODOs.
3) Keep it implementable today; prefer defaults that reduce complexity.
4) Do not fabricate libraries, APIs, or data; if unsure or the evidence is weak, mark the item as TODO/Low confidence and suggest concrete sources to verify.

## Additional Context
{{ADDITIONAL_CONTEXT}}

---
Start the research now and produce the guide for {{PROJECT_NAME}}.
