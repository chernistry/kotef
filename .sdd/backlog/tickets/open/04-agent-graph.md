# Ticket: 04 Agent Graph & Nodes (LangGraph.js)

Spec version: v1.0  
Context: `.sdd/project.md` (High-level Architecture Plan, SDD as brain), `.sdd/best_practices.md` (orchestration, safety, verification), `.sdd/architect.md` Sections 3–6 (Architecture Overview, Component Specifications, Agent Layer)  
Dependencies: 01-scaffold-core, 02-tools-fs, 03-tools-search.

## Objective & DoD
Implement the initial LangGraph agent orchestration with Planner, Researcher, Coder, and Verifier nodes, using SDD as the “brain” and tools as the “body”.

**Definition of Done:**
- [ ] `src/agent/state.ts` defines a typed `AgentState` interface consistent with `.sdd/architect.md`’s state schema.
- [ ] `src/agent/graph.ts` constructs the LangGraph state machine and exports a `buildKotefGraph(config: KotefConfig)` factory.
- [ ] Node implementations:
  - [ ] `Planner`: Reads SDD context + current messages; decides next action.
  - [ ] `Researcher`: Calls `deepResearch` tool.
  - [ ] `Coder`: Calls FS tools and prepares patches; does **not** apply changes blindly.
  - [ ] `Verifier`: Calls `test_runner` (stub implementation allowed in this ticket).
- [ ] Runtime prompts created in `src/agent/prompts/*.md` (meta-agent, planner, researcher, coder/verifier) with clear sections for tools and guardrails.
- [ ] Unit test verifies graph compilation, state transitions, and basic “happy path” execution using mocked tools/LLM.

## Implementation Sketch

```ts
// src/agent/state.ts
import type { ChatMessage } from '../core/llm';

export interface SddContext {
  project: string;       // raw text from .sdd/project.md
  architect: string;     // raw text from .sdd/architect.md
  bestPractices?: string;
  ticket?: string;       // current ticket markdown
}

export interface AgentState {
  messages: ChatMessage[];
  sdd: SddContext;
  plan?: unknown;        // later refined
  researchResults?: unknown;
  fileChanges?: unknown;
  testResults?: unknown;
  done?: boolean;
}
```

```ts
// src/agent/graph.ts
import { StateGraph } from '@langchain/langgraph';

export function buildKotefGraph(cfg: KotefConfig) {
  const builder = new StateGraph<AgentState>({ channels: {/* ... */} });
  // addNode('planner', plannerNode(cfg));
  // addNode('researcher', researcherNode(cfg));
  // ...
  // return builder.compile();
}
```

Node implementations should be strongly inspired by:
- `navan/root/src/agent/meta_agent.ts`
- `navan/root/src/prompts/meta_agent.md`
- `navan/root/src/prompts/planner.md`
- `finearts/callquest/root/src/prompts/meta_agent.md`

but without importing any domain-specific schemas. Only architectural patterns (tool routing, planner JSON, verification loop) should be reused.

## Steps
1. Define `AgentState` and `SddContext` in `src/agent/state.ts` according to `.sdd/architect.md`’s “Data Schema (Agent State)” section.
2. Design initial runtime prompts in `src/agent/prompts/`:
   - `meta_agent.md`: overall behavior and guardrails (respect SDD, use tools, diff-first).
   - `planner.md`: JSON plan format and allowed actions.
   - `researcher.md`: how to call `deepResearch` and structure findings.
   - `coder.md` / `verifier.md`: how to propose and verify patches.
3. Implement node functions in `src/agent/nodes/`:
   - `plannerNode`: examines `AgentState` and appends a planner message or directly chooses next node.
   - `researcherNode`: calls `deepResearch` and updates `researchResults`.
   - `coderNode`: calls FS tools (`readFile`, `writePatch`) and records proposed changes in `fileChanges`.
   - `verifierNode`: calls `test_runner` (even if stubbed) and updates `testResults` + `done`.
4. Wire up the graph in `src/agent/graph.ts` using LangGraph.js APIs:
   - define entry point (e.g. `planner`);
   - define edges planner → researcher/coder/verifier → planner/done.
5. Add unit tests in `test/agent/graph.test.ts` using mocked `callChat` and tools:
   - compile the graph and run a minimal scenario (e.g. planner → coder → verifier → done).

## Affected Files
- `src/agent/state.ts`
- `src/agent/graph.ts`
- `src/agent/nodes/*.ts`
- `src/agent/prompts/*.md`
- `test/agent/graph.test.ts`

## Tests
```bash
npm test test/agent/graph.test.ts
```

## Risks & Edge Cases
- Graph design that is too “open”, allowing infinite loops or runaway tool calls (mitigate via step limits in state or config and honor `maxRunSeconds` / token budgets).
- Missing or inconsistent SDD context (agent must fail fast or use Snitch Protocol, not guess).
- Overly complex prompts that make debugging difficult; keep MVP simple but safe.

## Non‑Goals / Pitfalls to Avoid
- Do **not** hard-code paths to kotef’s own `.sdd/`; the graph should operate on a generic `SddContext` provided by the CLI for the **target** project.
- Do **not** call filesystem or network APIs directly from nodes; all side effects must go through tools (`fs`, `web_search`, `deep_research`, `test_runner`) to keep behavior auditable and testable.
- Do **not** embed long prompts inline in TS files; keep them in `src/agent/prompts/*.md` and load them via a prompt loader so they remain editable and versionable.*** End Patch ***!
