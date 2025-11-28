# Project Description

kotef — autonomous AI coding & research agent that uses SDD as its "brain".

## Vision

Kotef is an **Architect + Tech Lead in a CLI**. It's not trying to be an IDE or code editor. Its unique value is the **SDD Brain**:
- Takes a vague goal and turns it into: best_practices.md, architect.md, tickets
- Does **deep web research** with quality scoring before making decisions
- Wraps execution in verification and constraints (Intent Contract)
- Learns from past runs (Project Memory)

## Core

- **Primary goal**: An autonomous agent that researches, plans, and codes — with full transparency via SDD artifacts.
- **Users**: Solo developers, tech leads, teams handling ticket backlogs.
- **Tech stack**: Node.js 20, TypeScript, LangGraph.js, OpenAI-compatible LLMs.

## Definition of Done

Functional outcomes:
- [ ] Run kotef against a local project with a natural-language goal
- [ ] If `.sdd/` missing, bootstrap SDD artifacts (project.md, best_practices.md, architect.md, tickets)
- [ ] If `.sdd/` exists, respect existing specs
- [ ] Perform deep web research for missing knowledge
- [ ] Implement code changes via tools with verification

Quality attributes:
- [ ] Respect timeouts, rate limits, host allowlists
- [ ] Never write outside allowed workspace; use diffs/patches
- [ ] All decisions grounded in repo files or web research (with citations)
- [ ] Clear logs for search, tool calls, code edits

Process constraints:
- [ ] Basic test coverage for core components
- [ ] Minimal "Getting Started" documentation

## Non-functional Requirements

- **Performance**: Single coding session (research → plan → edits) within minutes
- **Reliability**: Graceful degradation when APIs fail
- **Security**: No secrets in logs or prompts; host allowlists
- **Observability**: Structured JSON logs; hooks for metrics

## Architecture

See `.sdd/architect.md` for full specification.

High-level flow:
```
CLI → SDD Brain (bootstrap if needed) → Runtime Graph
                                              ↓
                              planner → researcher → coder → verifier
```

Key components:
- **SDD Layer**: `.sdd/` folder with project.md, architect.md, best_practices.md, tickets
- **Intent Contract**: Captures goal, constraints, DoD, forbidden paths
- **Research Cache**: Reuses SDD research at runtime
- **Project Memory**: Learns from past runs
- **Executor Interface**: Pluggable code-editing backends (internal, Kiro)

## Current Status (2025-11-28)

✅ Implemented:
- SDD bootstrap flow (Research → Architect → Tickets)
- Runtime graph (planner → researcher → coder → verifier)
- Intent Contract with constraints and DoD
- Research cache and project memory
- Consolidated prompts (2 LLM calls instead of 4+)
- Executor interface for pluggable backends
- Fast path for simple changes

📋 Open tickets: See `.sdd/backlog/tickets/open/`
