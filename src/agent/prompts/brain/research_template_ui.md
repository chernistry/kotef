# UI Best Practices Research Template (Improved)

Instruction for AI: produce a practical, evidence‑backed UI best practices guide tailored to this project and stack.

---

## Project Context
- Project: {{PROJECT_NAME}}
- Description: {{PROJECT_DESCRIPTION_CONTENT}}
- Tech stack: {{TECH_STACK}}
- Domain: {{DOMAIN}}
- Year: {{YEAR}}

## Task
Create a comprehensive UI best‑practices guide for {{PROJECT_NAME}} that is:
1) Current — relevant to {{YEAR}}; mark deprecated/outdated UI patterns.
2) Specific — tailored to {{TECH_STACK}} and {{DOMAIN}} with UI considerations.
3) Practical — include concrete CSS/HTML/JS code examples, design system tokens, UI component patterns.
4) Complete — cover design system, user experience, accessibility, responsive design, and visual design.

## Output Structure (Markdown)
### 1. TL;DR (≤10 bullets)
- Key UI decisions and patterns (why, trade‑offs, MVP vs later)
- Design system posture; Accessibility posture; UX priorities; Visual quality and performance guardrails
- What changed in {{YEAR}} UI trends; Framerate and responsiveness SLOs summary

### 2. Landscape — What’s new in {{YEAR}} UI
For {{TECH_STACK}}:
- Standards/framework updates; deprecations/EOL; new CSS features
- UI tooling maturity: design systems, theming, component libraries
- Accessibility & A11Y updates; WCAG 2.2 guidelines
- Alternative approaches and when to choose them

### 3. UI Architecture Patterns (2–4 for {{DOMAIN}} with {{TECH_STACK}})
Pattern A — [NAME] (MVP)
- When to use; Steps; Pros/Cons; Optional later features

Pattern B — [NAME] (Scale‑up)
- When to use; Migration from A

### 4. Priority 1 — [UI AREA: Design System/Visual Design]
Why → relation to goals and mitigated user experience risks
Scope → In/Out
Decisions → with rationale and alternatives
Implementation outline → 3–6 concrete steps
Guardrails & SLOs → metrics and limits/quotas
Failure Modes & Recovery → detection→remediation→rollback

### 5. Priority 1 — [UI AREA: User Experience/Interaction Design]
Why → relation to goals and mitigated user experience risks
Scope → In/Out
Decisions → with rationale and alternatives
Implementation outline → 3–6 concrete steps
Guardrails & SLOs → metrics and limits/quotas
Failure Modes & Recovery → detection→remediation→rollback

### 6. Priority 2 — [UI AREA: Accessibility]
Why → relation to goals and mitigated accessibility risks
Scope → In/Out
Decisions → with rationale and alternatives
Implementation outline → 3–6 concrete steps
Guardrails & SLOs → metrics and limits/quotas
Failure Modes & Recovery → detection→remediation→rollback

### 7. Priority 3 — [UI AREA: Responsive Design]
Why → relation to goals and mitigated responsive experience risks
Scope → In/Out
Decisions → with rationale and alternatives
Implementation outline → 3–6 concrete steps
Guardrails & SLOs → metrics and limits/quotas
Failure Modes & Recovery → detection→remediation→rollback

### 8. Design System & Visual Tokens (for {{TECH_STACK}})
- Color palettes, typography scales, spacing systems, shadows, radii
- CSS custom properties strategy, theming approach
- Component library approach (if applicable)

### 9. Accessibility Best Practices
- WCAG 2.2 AA compliance; semantic HTML; ARIA roles/labels
- Keyboard navigation; focus management; screen reader compatibility
- Color contrast ratios; motion reduction options

### 10. Performance & UX Responsiveness
- Frame rate (60fps) and input latency; CSS optimization techniques
- Asset optimization, lazy loading, progressive enhancement
- Interaction responsiveness and feedback

### 11. Code Quality Standards for UI
- CSS architecture (BEM, ITCSS, SMACSS, etc.); naming conventions
- Component structure; design token usage; HTML semantics
- UI testing: visual regression, accessibility, interaction tests

### 12. Responsive & Cross-Platform Considerations
- Breakpoint strategy; touch vs. mouse interactions
- Cross-browser compatibility; mobile/tablet/desktop optimization

### 13. Reading List (with dates and gists)
- [Source] (Last updated: YYYY‑MM‑DD) — gist

### 14. Decision Log (ADR style)
- [ADR‑001] [UI Choice] over [alternatives] because [reason]

### 15. Anti‑Patterns to Avoid
- For {{TECH_STACK}}/{{DOMAIN}} with “what, why bad for UX, what instead”

### 16. Evidence & Citations
- List sources inline near claims; add links; include “Last updated” dates when possible.

### 17. Verification
- Self‑check: how to validate key UI recommendations (accessibility tools, performance metrics, UX checklists)
- Confidence: [High/Medium/Low] per section

## Requirements
1) No chain‑of‑thought. Provide final answers with short, verifiable reasoning.
2) If browsing is needed, state what to check and why; produce a provisional answer with TODOs.
3) Keep it implementable today; prefer defaults that reduce complexity.
4) Include specific CSS custom properties, design tokens, and component examples.

## Additional Context
{{ADDITIONAL_CONTEXT}}

---
Start the research now and produce the UI guide for {{PROJECT_NAME}}.
