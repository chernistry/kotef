# Ticket: 03 runtime-prompts-hardening

Spec version: v1.0 / architect.md

## Context
- Runtime prompts live in `src/agent/prompts`:
  - `meta_agent.md`, `planner.md`, `researcher.md`, `coder.md`, `verifier.md`, `search_query_optimizer.md`,
  - plus the new `research_relevance_evaluator.md` and `research_query_refiner.md`.
- The Prompt Engineering guide (`Prompt_Engineering_Techniques_Comprehensive_Guide.md`) and agentic systems best‑practices doc both recommend:
  - Clear separation of **task description**, **inputs**, **rules**, and **output schema**.
  - Strict JSON schemas when parsing.
  - Explicit instructions on uncertainty / abstention and groundedness.
  - Profile‑aware behaviour (fast / strict / yolo) and task‑scope‑aware guardrails.
- Some prompts already follow this, others are legacy / less structured and can be made more robust and less error‑prone.

## Objective & Definition of Done
**Objective:** Bring all runtime prompts to a consistent, modern style that reduces JSON failures, loops, and hallucinations while staying compact enough for fast runs.

**Definition of Done:**
- Each runtime prompt has:
  - A clear “Task” section.
  - An explicit “Inputs” section showing what the model sees.
  - A “Rules” section that covers uncertainty, grounding, and tool usage expectations.
  - A precise “Output” section, including JSON schema when the code parses the response.
- JSON‑consuming prompts (planner, research scoring, tickets, etc.) explicitly:
  - Ban markdown fences.
  - Ban chain‑of‑thought in the final channel (analysis may be implicit, but output must be clean).
  - Include at least one example of a valid output object (short).
- Profile / taskScope integration:
  - Prompts reference execution profiles (`strict`, `fast`, `smoke`, `yolo`) and task scopes (`tiny`, `normal`, `large`) where relevant (esp. `coder` and `verifier`).
  - For “tiny” or `yolo` mode, prompts allow skipping or softening lint/coverage requirements while still enforcing obvious correctness.

## Steps
1. Read:
   - `allthelogs/.../Prompt_Engineering_Techniques_Comprehensive_Guide.md`
   - `allthelogs/.../agentic_systems_building_best_practices.md`
   and extract 5–10 concrete prompt rules to apply (e.g., structure, abstention, schema, grounding).
2. Audit each runtime prompt in `src/agent/prompts`:
   - Note where instructions are ambiguous, redundant, or missing explicit JSON schema.
   - Identify where execution profile / taskScope should affect behaviour but currently does not.
3. Refactor prompts in small, reviewable changes:
   - Keep semantics the same (planner still decides next node; coder still calls tools).
   - Focus on tightening structure and reducing causes of JSON parse errors or planner loops.
4. Run a small evaluation set:
   - Use `scripts/eval_prompts.ts` or a new script to run 5–10 canned scenarios (Python GUI, HTML flag, small refactor, etc.).
   - Compare rates of JSON parsing errors and unwanted loops before/after.
5. Update documentation:
   - Brief section in `README.md` (or `/docs/prompts.md`) describing prompt design principles in kotef.

## Affected files/modules
- `src/agent/prompts/*.md`
- Optional: `scripts/eval_prompts.ts`
- `README.md` (short note)

## Tests
- Prompt‑level evaluation via existing `eval:prompts` script (or similar).
- Manual smoke runs of `bin/kotef run` on 2–3 example goals to ensure no regressions.

## Risks & Edge Cases
- Over‑tightening prompts may unintentionally limit model creativity; balance strictness with flexibility.
- Changing prompts alters behaviour; keep changes incremental and well‑documented.

## Dependencies
- Independent of Tickets 01–02, but benefits from their logging when debugging planner/coder behaviour.


