# Ticket: 04 Interactive SDD Orchestrator Graph

Spec version: v1.0  
Context: `.sdd/project.md` (High-level Architecture Plan, auto-SDD flow), `.sdd/architect.md` (Orchestrator sketch),  
`brain/templates/*` (SDDRush prompts), `src/sdd/template_driver.ts` (Ticket 03)  
Dependencies: 01-scaffold-core, 02-tools-fs, 03-sddrush-template-driver, web_search/deep_research tools (from closed 03-tools-search), coding graph (from closed 04-agent-graph).

## Objective & DoD
Implement a LangGraph-based **SDD orchestrator** that, given a repo + user goal:
- runs the SDD phases using SDDRush templates:
  1. Research → write/update `.sdd/best_practices.md`
  2. Architect → write/update `.sdd/architect.md`
  3. Tickets → create `.sdd/backlog/tickets/open/*`
- then hands off to the coding graph for ticket execution.

This should approximate the behavior of “normal coding agents” (Claude Code / Gemini Code / Qwen Code, etc.), but explicitly driven by SDD.

**Definition of Done:**
- [ ] A LangGraph graph (or subgraph) implemented at `src/agent/graphs/sdd_orchestrator.ts` with at least the following logical nodes:
  - `sdd_research` – renders research prompt via SDDRush template and calls LLM; writes `.sdd/best_practices.md`.
  - `sdd_architect` – renders architect prompt, calls LLM; writes `.sdd/architect.md`.
  - `sdd_tickets` – renders agent/ticket prompt, calls LLM; writes initial tickets to `.sdd/backlog/tickets/open/`.
- [ ] Nodes use:
  - `renderBrainTemplate` (Ticket 03),
  - web_search/deep_research tools for evidence gathering,
  - FS tools for writing `.sdd/*`.
- [ ] The orchestrator graph exposes a single entry function:
  - `runSddOrchestration(cfg: KotefConfig, rootDir: string, goal: string): Promise<void>`
  - which can be called by CLI (Ticket 05) and bootstrap logic (Ticket 07).
- [ ] Orchestrator is **idempotent-ish**:
  - if `.sdd/` already exists, it updates or appends clearly-delimited sections (or writes under `.sdd/bootstrap/`) instead of blindly overwriting.
- [ ] Basic tests (with mocked LLM + tools) confirm:
  - graph compiles and runs a simple scenario,
  - expected `.sdd/*` files are created/updated.

## Implementation Sketch

```ts
// src/agent/graphs/sdd_orchestrator.ts
import { StateGraph } from '@langchain/langgraph';

export interface SddOrchestratorState {
  goal: string;
  rootDir: string;
  sddExists: boolean;
  researchDone?: boolean;
  architectDone?: boolean;
  ticketsDone?: boolean;
}

export async function runSddOrchestration(
  cfg: KotefConfig,
  rootDir: string,
  goal: string,
): Promise<void> {
  // build StateGraph<SddOrchestratorState>, run through sdd_research → sdd_architect → sdd_tickets
}
```

Node behavior (high-level):
- `sdd_research`:
  - uses `template_driver.renderBrainTemplate('research', ctx)` to build the prompt,
  - calls LLM (modelFast) and writes result to `.sdd/best_practices.md`.
- `sdd_architect`:
  - builds architect prompt, calls LLM (modelStrong if needed),
  - writes `.sdd/architect.md`.
- `sdd_tickets`:
  - builds agent/ticket prompt,
  - creates ticket files with SDDRush ticket structure.

You MAY:
- directly borrow node/graph patterns from the existing coding graph (closed 04-agent-graph) and Navan’s graphs, adapting to SDD phases.

## Steps
1. Define `SddOrchestratorState` and any helper types in `src/agent/state.ts` or a dedicated file.
2. Design minimal prompts for orchestrator nodes by combining:
   - SDDRush templates (via Ticket 03),
   - runtime prompt guidelines (Ticket 08, where applicable),
   - explicit I/O contracts (file paths, expected sections).
3. Implement `sdd_research`, `sdd_architect`, `sdd_tickets` node functions that:
   - call `renderBrainTemplate`,
   - call LLM via `callChat`,
   - write `.sdd/*` via FS tools.
4. Wire nodes into `sdd_orchestrator` graph and export `runSddOrchestration`.
5. Add tests with mocked LLM + FS that assert:
   - for a dummy repo, after running the graph, `.sdd/best_practices.md`, `.sdd/architect.md`, and at least one ticket exist.

## Affected Files
- `src/agent/graphs/sdd_orchestrator.ts`
- `src/agent/state.ts` (if reused/extended)
- `test/agent/sdd_orchestrator.test.ts`

## Tests
```bash
npm test test/agent/sdd_orchestrator.test.ts
```

## Risks & Edge Cases
- Overwriting hand-crafted `.sdd/` specs; mitigate by appending or writing to separate “bootstrap” sections/files.
- Overly heavy orchestration (too many LLM calls) for simple tasks; respect guardrails and keep phases minimal.

## Non‑Goals / Pitfalls to Avoid
- Do **not** entangle SDD orchestration with the main coding graph logic; keep it as a separate graph or subgraph that produces `.sdd/*` and tickets, then hands off.
- Do **not** invent new SDD formats; stick to SDDRush-style project/architect/ticket structure. 

