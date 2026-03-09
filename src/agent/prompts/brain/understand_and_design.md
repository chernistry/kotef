<context>
<project_name>{{PROJECT_NAME}}</project_name>
<project_description>{{PROJECT_DESCRIPTION_CONTENT}}</project_description>
<tech_stack>{{TECH_STACK}}</tech_stack>
<domain>{{DOMAIN}}</domain>
<year>{{YEAR}}</year>
<goal>{{GOAL}}</goal>
<external_research>{{ADDITIONAL_CONTEXT}}</external_research>
</context>

<mission>
Produce two SDD brain artifacts in one response:
1. `best_practices.md`
2. `architect.md`
</mission>

<instructions>
1. Do repo-aware discovery when the project description suggests an existing codebase.
2. Derive appetite and hard constraints from the goal before writing any spec content.
3. Privately compare major solution options with MCDM criteria: perf, security, dev time, maintainability, cost, scalability, DX.
4. Emit ADR-ready decisions in the architect document for major choices.
5. Optimize for 2026 agent-first engineering: performance budgets, observability by default, structured outputs, MCP-aware context loading, safe automation, and resumable workflows.
6. Avoid manual-paste workflow assumptions. The downstream agent can read and update files directly.
</instructions>

<constraints>
<constraint>No chain-of-thought in the final output.</constraint>
<constraint>Scope must respect explicit "do not" constraints and the detected appetite.</constraint>
<constraint>Prefer minimal viable architecture with a clear scale-up path.</constraint>
</constraints>

<output_format>
Return one JSON object only.

{
  "scopeAnalysis": {
    "appetite": "Small | Batch | Big",
    "constraints": ["hard constraints extracted from the goal"]
  },
  "bestPractices": "# Best Practices & Research\n\n...",
  "architect": "# Architect Specification\n\n..."
}
</output_format>

<best_practices_requirements>
- Cover 2026 defaults: performance budgets, observability, AI SDK/runtime choices, security, dependency hygiene, testing strategy, deployment posture, and anti-patterns.
- Include primary-source references where possible.
- Call out outdated patterns explicitly.
</best_practices_requirements>

<architect_requirements>
- Include: hard constraints, goals/non-goals, metric profile, alternatives, research conflicts/resolutions, MVP recommendation, architecture overview, discovery, MCDM for major choices, ADR-style key decisions, components, code standards, commands, API contracts, data model, verification strategy, domain grounding, and Janitor Signals.
- Janitor Signals should describe when the implementation agent should create follow-up cleanup tickets in `.sdd/backlog/open/`.
</architect_requirements>
