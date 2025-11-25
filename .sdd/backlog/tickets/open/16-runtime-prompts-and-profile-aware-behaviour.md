# Ticket: 16 Runtime Prompts & Profile‑Aware Behaviour

Spec version: v1.2  
Context: `.sdd/architect.md` (profiles, DoD, stop rules), `.sdd/best_practices.md` (Prompt engineering, cost and safety guardrails), `Prompt_Engineering_Techniques_Comprehensive_Guide.md`, runtime prompts in `src/agent/prompts/{meta_agent.md,planner.md,researcher.md,coder.md,verifier.md}`, plus search prompts from ticket 15.  
Dependencies: 13 (Goal‑First DoD & profiles), 10 (execution profiles), 11 (failure feedback loop), 14 (flow & stop‑rules hardening), 15 (web research optimization).

## Objective & DoD

Bring all **runtime prompts** in line with modern prompt engineering best practices and make them explicitly aware of:

- execution profiles (`strict`, `fast`, `smoke`, `yolo`),
- task scope (`tiny`, `normal`, `large`),
- SDD context (project, architect, best_practices), and
- available tools (FS, commands, search, tests).

We want prompts that:

- are **structured and deterministic** (clear schemas, minimal ambiguity),
- **encourage abstention** and escalation when unsure instead of hallucination,
- tell the agent **when to read files, when to search, and when to stop**, and
- minimize unnecessary tool calls and long reasoning for trivial tasks.

### Definition of Done

- [ ] Each runtime prompt (`meta_agent.md`, `planner.md`, `researcher.md`, `coder.md`, `verifier.md`) is rewritten with:
  - [ ] Sections: **Task / Inputs / Available Tools / Constraints / Profiles & TaskScope / Output format**.
  - [ ] A clear statement: “If you are unsure or lack enough information, escalate or say you are unsure rather than guessing.”
  - [ ] Explicit guidance on when to:
    - read files (`list_files`, `read_file`),
    - run commands (`run_command`, `run_tests`),
    - call web research tools, and
    - stop and return a partial result.
- [ ] Prompts no longer contain internal “thinking process” debris or inconsistent styles (no stray examples with fenced JSON that don’t match parsers).
- [ ] Profile‑ and scope‑aware policies are codified in the prompts, e.g.:
  - [ ] `tiny` + `yolo`: prefer minimal steps, no exhaustive refactors, skip broad `npm test` when out of scope.
  - [ ] `strict` + `large`: allow deeper reasoning, more tool calls, and insist on hard gates.
- [ ] Coder and Verifier prompts instruct the agent to:
  - [ ] Avoid repeating the same patch endlessly; if the same error persists after N attempts, call out being stuck.
  - [ ] Distinguish **goal‑local** tasks (e.g. fix one Vite import path) from **global repo health** (e.g. all tests).

## Implementation Sketch

### 1. Shared Prompt Design Principles

Add a small shared design note (in comments or an internal doc, not in prompts) based on the Prompt Engineering Guide:

- Use **task‑first** phrasing: state clearly what the node must decide or produce.
- Use **inputs** sections that list precisely what the model sees: goal, SDD snippets, research summary, state metrics.
- Use **output schemas** with strict JSON where the runtime parses JSON.
- Include **hallucination prevention** lines: permission to say “I don’t know”, emphasis on citing sources or SDD.
- Keep system prompts succinct; avoid redundant descriptions that waste tokens.

### 2. `meta_agent.md`

Role: global meta‑prompt for the whole agent (high‑level policy).

- Clarify:
  - The agent is operating inside a **real filesystem** with tools.
  - SDD files are the brain: always check `.sdd/project.md`, `.sdd/architect.md`, `.sdd/best_practices.md`, and tickets when available.
  - Never edit outside the root; respect diff‑first edits and permission model.
  - It can and should:
    - read relevant files,
    - run tests or build commands,
    - use web research tools when local knowledge is insufficient,
    - and log issues to `.sdd/issues.md` via Snitch.
- Add a short section on **profiles** and **taskScope**:
  - In `yolo` or `fast` for `tiny` tasks, emphasize:
    - “Prefer making the smallest change that satisfies the goal.”
    - “Do not attempt to fix all tests in the repo unless the goal demands it.”

### 3. `planner.md`

Planner’s prompt should:

- Accept as input:
  - user goal,
  - excerpts from SDD (DoD, constraints, tickets),
  - last node results (researchQuality, testResults, file change summary, loopCounters),
  - current profile + taskScope.
- Task: choose **next node** among `researcher`, `coder`, `verifier`, `snitch`, `done`, and produce a short machine‑readable plan.
- Output schema:

```json
{
  "next": "researcher | coder | verifier | snitch | done",
  "reason": "string",
  "plan": [
    { "id": "string", "owner": "planner|coder|researcher|verifier", "action": "string", "detail": "string" }
  ]
}
```

- Explicit instructions:
  - Use researchQuality to **avoid redundant research**.
  - Use loop counters and error signatures (provided via state) to detect being stuck.
  - Respect profile‑specific stop rules (from tickets 13 & 14).

### 4. `researcher.md`

Researcher prompt should:

- Clarify:
  - When to use **shallow search** vs **deepResearch** (referencing ticket 15).
  - How to summarise findings in a form that architect/coder can consume (bullet points with citations).
  - That it must avoid over‑searching if quality is already high.
- Output:
  - A list of findings with:

    ```json
    {
      "summary": "string",
      "citations": [{ "url": "string", "title": "string" }]
    }
    ```

  - plus a short note to planner about **what is still unknown** or ambiguous.

### 5. `coder.md`

Coder prompt should:

- Emphasize:
  - Always inspect the repo first via `list_files` / `read_file`.
  - Prefer **minimal diff** that satisfies the goal.
  - Use the right tools for the stack (Python vs TS vs JS).
  - Track progress: “If you have tried the same kind of fix multiple times and the error message doesn’t change, stop and report being stuck rather than guessing again.”
- Include guidance on:
  - When to run commands, and which (see ticket 17).
  - When to skip heavy commands in `tiny`/`yolo` mode.

### 6. `verifier.md`

Verifier prompt should:

- Take in:
  - test command to run, profile, taskScope,
  - last test outputs, error signatures.
- Decide:
  - whether to run tests at all (for `tiny` tasks, may skip),
  - whether the results are blocking or advisory given the profile,
  - whether to call coder again or signal an end state.
- Output:

```json
{
  "run_tests": true,
  "tests_command": "string",
  "done": false,
  "reason": "string",
  "severity": "blocking | advisory"
}
```

## Steps

1. **Audit current prompts**
   - [ ] Snapshot existing `meta_agent.md`, `planner.md`, `researcher.md`, `coder.md`, `verifier.md`.
   - [ ] Identify all places where:
     - [ ] outputs are not clearly structured,
     - [ ] profiles/taskScope are not used,
     - [ ] instructions encourage over‑testing or over‑searching.

2. **Design new schemas**
   - [ ] For each prompt, design JSON schema matching current TypeScript parsers or adjust parsers accordingly.
   - [ ] Align with the Prompt Engineering Guide (no fenced code, explicit fields, numeric ranges where needed).

3. **Rewrite prompts**
   - [ ] Rewrite each file with the new structure and content.
   - [ ] Integrate cross‑references to:
     - [ ] SDD as brain,
     - [ ] profiles and taskScope,
     - [ ] stop rules and research quality.

4. **Wire profile/taskScope into node implementations**
   - [ ] Ensure nodes pass profile and scope into prompt calls.
   - [ ] Adjust node logic to respect new fields (e.g., `severity`, `done` flags) in the parsed JSON.

5. **Smoke‑test on representative tasks**
   - [ ] Run kotef on:
     - [ ] Small Python GUI task.
     - [ ] Vite import‑error fix.
     - [ ] Tiny HTML/CSS/JS task.
   - [ ] Verify:
     - [ ] Flow completes without pathological loops.
     - [ ] Prompts produce parsable JSON outputs.
     - [ ] Behaviour differs appropriately between `strict` and `yolo`.

## Affected Files / Modules

- `src/agent/prompts/{meta_agent.md,planner.md,researcher.md,coder.md,verifier.md}`
- `src/agent/nodes/{planner.ts,researcher.ts,coder.ts,verifier.ts}`
- `src/agent/state.ts` (profile & taskScope wiring, if needed)
- `test/agent/prompt_contracts.test.ts` (new, to assert JSON shape)

## Risks & Edge Cases

- Over‑specifying prompts might make the agent too rigid or verbose; keep instructions concise and rely on schemas rather than long prose.
- Changes to schemas may break existing parsing logic; mitigate by updating tests and rolling changes carefully.

## Non‑Goals

- This ticket does **not** change the overall graph structure or add new nodes.
- It does **not** attempt automated offline prompt tuning; it focuses on structural hardening and explicit policies.


