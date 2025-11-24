# kotef — SDD‑Driven Coding & Research Agent

kotef is an autonomous coding and deep‑research agent that uses Spec‑Driven Development (SDD) as its core “brain”.

High‑level idea:
- Long‑term goals, Definition of Done, architecture, coding standards, and tickets live in `.sdd/*` (SDD layer).
- The runtime agent (implemented in Node.js 20 + TypeScript + LangGraph.js) reads these specs and uses tools for:
  - web search and deep research,
  - repository inspection and patch generation,
  - running tests/linters,
  - feeding results back into SDD (issues, ADR updates, new tickets).
- The SDD framework in `brain/` provides prompt templates and flow (Research → Architect → Agent), while `.sdd` describes kotef itself.

Key references:
- SDD toolkit / templates: `brain/`
- kotef SDD spec: `.sdd/project.md`, `.sdd/best_practices.md`, `.sdd/architect.md`, `.sdd/backlog/tickets/*`
- Agentic systems best practices (must be read and reflected in `architect.md`):
  `/Users/sasha/IdeaProjects/allthedocs/learning/research/ai_engineering/agentic_systems_building_best_practices.md`

See `.sdd/project.md` for the full project description, Definition of Done, and architectural plan.

