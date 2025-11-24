# Ticket: 08 Runtime Agent Prompts Hardening

Spec version: v1.0  
Context: `.sdd/project.md` (agent behavior & goals), `.sdd/architect.md` (Agent Layer, Orchestrator sketch),  
`allthedocs/learning/research/ai_engineering/Prompt_Engineering_Techniques_Comprehensive_Guide.md` (prompt best practices),  
Navan/CallQuest prompts:
- `personal_projects/navan/root/src/prompts/meta_agent.md`
- `personal_projects/navan/root/src/prompts/planner.md`
- `personal_projects/finearts/callquest/root/src/prompts/meta_agent.md`

Dependencies: 01-scaffold-core, 03-tools-search, 04-agent-graph (graph & state), 05-cli-entrypoint.

## Objective & DoD
Design and implement **runtime** prompts (not SDD prompts) for kotef’s coding agent (meta-agent, planner, researcher, coder, verifier) that:
- follow modern prompt-engineering best practices (structure, grounding, safety, refusal),
- are suitable for multi-provider frontier models (ChatGPT 5.1, Claude Sonnet 4.5, Gemini 3 Pro, etc.),
- lean heavily on proven patterns from Navan/CallQuest prompts while being domain-neutral.

**Definition of Done:**
- [ ] Runtime prompt files created under `src/agent/prompts/`:
  - `meta_agent.md` – main system prompt for the coding agent.
  - `planner.md` – tool/plan JSON planner and routing logic.
  - `researcher.md` – focused web/deep research prompt.
  - `coder.md` – code-edit + diff-first + tests prompt.
  - `verifier.md` – verification prompt (tests, SDD alignment, receipts).
- [ ] Each prompt:
  - [ ] has a clearly structured layout (role, inputs, tools, constraints, output format),
  - [ ] includes explicit instructions for grounding, non-hallucination, and refusal (“better to say unsure”),
  - [ ] defines JSON schemas (where outputs are machine-parsed) and forbids free-form chain-of-thought in model responses,
  - [ ] respects SDD as source of truth (must refer to `.sdd/project.md`, `.sdd/architect.md`, tickets as the “brain”).
- [ ] A small TypeScript helper `src/core/prompts.ts` implemented to load these runtime prompts safely (with caching, path resolution, and basic validation).
- [ ] Unit tests or snapshot tests cover that prompts can be loaded and that the planner JSON schema is syntactically valid.

## Implementation Sketch

```ts
// src/core/prompts.ts
export type RuntimePromptName =
  | 'meta_agent'
  | 'planner'
  | 'researcher'
  | 'coder'
  | 'verifier';

export function loadRuntimePrompt(name: RuntimePromptName): string {
  // resolve from src/agent/prompts/<name>.md
  // throw clear error if missing
}
```

Prompt design guidance (high level):
- **Meta-agent prompt**:
  - role: “spec-driven coding agent”,
  - inputs: user goal, SDD context, ticket (if any), recent messages,
  - responsibilities: pick intents (research, plan, edit, verify), call tools, respect guardrails,
  - enforce: no hidden state, no silent edits, follow SDD + DoD.
- **Planner prompt**:
  - strict JSON output: list of steps + selected tools + approximate cost,
  - clear refusal paths (if SDD missing or conflicting – delegate to bootstrap/Snitch).
- **Researcher prompt**:
  - treat web content as untrusted,
  - require citations and explicit uncertainty when information is missing.
- **Coder / Verifier prompts**:
  - require diff-first edits, tests, and explicit mention if tests could not be run,
  - reinforce not to expand scope beyond ticket without creating issues/janitor tickets.

You MUST:
- read and follow the patterns from  
  `Prompt_Engineering_Techniques_Comprehensive_Guide.md`:
  - multi-section prompts (Context / Role / Inputs / Tools / Output / Guardrails),
  - schema-constrained outputs (JSON or Markdown with strict sections),
  - explicit hallucination-prevention and refusal policies,
  - separation of “thinking” vs “answer” where needed (but **never** leak CoT in user-visible channels).
- study Navan/CallQuest prompts listed above; you MAY **directly borrow** phrasing and structure as a starting point, but MUST:
  - remove travel/callquest domains,
  - adapt tools/intents to kotef,
  - modernize according to the prompt guide.

## Steps
1. Review:
   - the prompt guide (`Prompt_Engineering_Techniques_Comprehensive_Guide.md`),
   - Navan/CallQuest meta-agent and planner prompts,
   - kotef’s SDD (`.sdd/project.md`, `.sdd/architect.md`) to understand roles and tools.
2. Draft `src/agent/prompts/meta_agent.md`:
   - include sections for Role, Context, Tools, Policies, Output format,
   - define allowed intents/actions and how they map to tools.
3. Draft planner/researcher/coder/verifier prompts in `src/agent/prompts/*.md`, each with:
   - clear input sections (what the node sees),
   - explicit, machine-checkable output format (JSON or strongly structured Markdown),
   - hallucination-prevention policies as per the guide.
4. Implement `src/core/prompts.ts` to load these prompts with clear error messages.
5. Add basic tests:
   - ensure all prompt files exist and can be read,
   - parse planner JSON schema (e.g. with zod) to ensure it is valid.

## Affected Files
- `src/agent/prompts/meta_agent.md`
- `src/agent/prompts/planner.md`
- `src/agent/prompts/researcher.md`
- `src/agent/prompts/coder.md`
- `src/agent/prompts/verifier.md`
- `src/core/prompts.ts`
- tests under `test/core/prompts.test.ts` (or similar)

## Tests
```bash
npm test test/core/prompts.test.ts
```

## Risks & Edge Cases
- Overly verbose prompts that inflate token usage; keep them structured but concise, and rely on tooling/SDD for context instead of repeating long specs.
- Output formats that are too complex for the LLM to follow reliably; prefer simple, robust schemas over deeply nested structures.
- Prompt drift when models are updated; consider keeping prompts versioned and referenced from SDD for future evolution.

## Non‑Goals / Pitfalls to Avoid
- Do **not** modify SDD prompts in `.sdd/prompts/*.prompt.md` as part of this ticket; they are part of the SDDRush “brain” and are handled separately.
- Do **not** rely on hidden chain-of-thought in user-facing outputs; separate any internal reasoning requests from visible answer channels per the prompt guide.
- Do **not** hardcode provider/model names in prompts; refer generically to “the model” and keep provider-specific tuning in config, not in prompt text.

