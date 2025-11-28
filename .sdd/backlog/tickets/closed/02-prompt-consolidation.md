# Ticket: 02 Prompt Consolidation — Reduce Fragmentation

Spec version: v1.0  
Context: Architecture review problem **#8 (Prompt fragmentation)**, best practices doc (Chain-of-Thought, single-agent patterns), current prompts in `src/agent/prompts/body/*.md` and `brain/*.md`.

## Problem Statement

Current kotef has **10+ separate prompts** in a chain:
```
goal → research prompt → best_practices prompt → architect prompt 
     → ticket_plan prompt → ticket_generate × N → planner prompt 
     → researcher prompt → coder prompt → verifier prompt
```

Each prompt sees only its slice of context. Constraints from goal dilute through the chain. This contradicts modern best practices where agents use fewer, more comprehensive prompts with chain-of-thought reasoning.

## Objective & DoD

Consolidate prompts to reduce context drift and LLM calls while maintaining functionality.

### Definition of Done

- [ ] SDD bootstrap uses **2 prompts** instead of 4-5:
  - "Understand & Design" (combines research + best_practices + architect)
  - "Plan Work" (generates all tickets in one call)
- [ ] Runtime agent uses **3 core prompts** instead of 5+:
  - "Think & Plan" (combines planner + researcher decision)
  - "Execute" (coder)
  - "Validate & Learn" (combines verifier + retrospective)
- [ ] Total LLM calls for typical task reduced by ~40%
- [ ] No regression in output quality (manual verification)

## Implementation Sketch

### Phase 1: SDD Bootstrap Consolidation

**Current flow (4+ LLM calls):**
```
deepResearch() → LLM: best_practices.md → LLM: architect.md 
              → LLM: ticket_plan → LLM × N: ticket_generate
```

**New flow (2 LLM calls):**
```
deepResearch() → LLM: "Understand & Design" (outputs best_practices + architect)
              → LLM: "Plan Work" (outputs all tickets at once)
```

1. Create `src/agent/prompts/brain/understand_and_design.md`:
   - Combines research synthesis, best practices extraction, and architecture design
   - Single comprehensive prompt with clear sections
   - Output format: JSON with `{ bestPractices: string, architect: string }`

2. Create `src/agent/prompts/brain/plan_work.md`:
   - Takes architect + goal + code map
   - Outputs all tickets in one structured response
   - Format: `{ tickets: [{ filename, title, content }] }`

3. Update `sdd_orchestrator.ts`:
   - Replace sequential calls with consolidated prompts
   - Parse combined outputs and write files

### Phase 2: Runtime Prompt Consolidation

**Current flow:**
```
planner.md → (decides) → researcher.md → planner.md → coder → verifier.md → planner.md
```

**New flow:**
```
think_and_plan.md → (includes research decision) → coder → validate_and_learn.md
```

1. Create `src/agent/prompts/body/think_and_plan.md`:
   - Merges planner + researcher decision logic
   - If research needed, outputs research queries AND next action
   - Reduces planner↔researcher loops

2. Create `src/agent/prompts/body/validate_and_learn.md`:
   - Combines verification analysis + retrospective
   - Single call after tests run
   - Outputs: verdict, lessons, next action

3. Update graph edges:
   - `think_and_plan` can directly output research queries (no separate researcher prompt)
   - `validate_and_learn` replaces verifier + retrospective sequence

### Phase 3: Prompt Template Improvements

For all consolidated prompts:
- Include full `IntentContract` (from ticket 01)
- Use chain-of-thought sections: `<thinking>`, `<decision>`, `<output>`
- Explicit constraint reminders at decision points
- Bounded output sections to prevent runaway generation

## Steps

1. **Create consolidated brain prompts**
   - [ ] Write `understand_and_design.md` combining research/bp/architect
   - [ ] Write `plan_work.md` for batch ticket generation
   - [ ] Update `sdd_orchestrator.ts` to use new prompts

2. **Create consolidated runtime prompts**
   - [ ] Write `think_and_plan.md` merging planner/researcher
   - [ ] Write `validate_and_learn.md` merging verifier/retrospective
   - [ ] Update graph nodes to use consolidated prompts

3. **Deprecate old prompts**
   - [ ] Mark old prompts as deprecated (don't delete yet)
   - [ ] Add migration notes

4. **Validation**
   - [ ] Run on 2-3 test projects
   - [ ] Compare LLM call count before/after
   - [ ] Verify output quality maintained

## Affected Files

- `src/agent/prompts/brain/understand_and_design.md` (new)
- `src/agent/prompts/brain/plan_work.md` (new)
- `src/agent/prompts/body/think_and_plan.md` (new)
- `src/agent/prompts/body/validate_and_learn.md` (new)
- `src/agent/graphs/sdd_orchestrator.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/nodes/researcher.ts`
- `src/agent/nodes/verifier.ts`
- `src/agent/nodes/retrospective.ts`
- `src/agent/graph.ts`

## Risks & Mitigations

- **Risk:** Consolidated prompts too long, hit token limits
  - **Mitigation:** Use structured sections, truncate less relevant parts dynamically
- **Risk:** Loss of specialization in combined prompts
  - **Mitigation:** Keep clear section headers, test output quality
- **Risk:** Harder to debug which "part" of prompt caused issues
  - **Mitigation:** Use `<thinking>` sections for transparency

## Non-Goals

- Full rewrite of all prompts (incremental consolidation)
- Changing the fundamental graph structure (separate ticket)
- Adding new capabilities (this is simplification only)

## Priority

**HIGH** — This addresses a fundamental architectural issue causing context drift.

## Dependencies

- Should be done AFTER ticket 01 (Intent Contract) so consolidated prompts can use it
- Independent of other tickets
