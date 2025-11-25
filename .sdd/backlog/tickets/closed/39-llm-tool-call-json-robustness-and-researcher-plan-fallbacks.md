# Ticket: 39 LLM Tool‑Call JSON Robustness & Researcher Plan Fallbacks

Spec version: v1.0  
Context: `.sdd/architect.md` (LLM contracts, JSON‑only responses), `.sdd/best_practices.md` (§2 Prompting & Contracts, §4 Validation & Error Handling), logs in `logs/run.log` showing:

- `KotefLlmError: LLM Call Failed: Expected ',' or '}' after property value in JSON …` originating from `callChat` during coder node tool calls, and  
- `Researcher LLM failed` with fallback to a generic `"Analyze project"` query leading to low‑value Tavily searches and weak grounding.

Relevant code: `src/core/llm.ts`, `src/agent/nodes/{coder.ts,researcher.ts}`, `src/agent/graphs/sdd_orchestrator.ts` (for prior JSON repair pattern).

## Objective & DoD

Make the agent **resilient to mildly malformed tool‑call JSON and researcher plans** so that:

- A single bad `tool_call.arguments` payload does not crash the entire run.
- Researcher falls back to **goal‑aware, specific queries**, not generic “Analyze project”.

### Definition of Done

- [ ] `callChat`:
  - [ ] No longer throws when `tool_call.function.arguments` is not valid JSON.
  - [ ] Instead, passes through the raw string (or a repaired JSON object) so downstream nodes can handle it gracefully.
  - [ ] Still preserves normal behaviour when arguments are valid JSON.
- [ ] Coder node:
  - [ ] Continues to parse `tool_call.function.arguments` locally inside its own try/catch, surfacing errors as tool results rather than process‑wide failures.
  - [ ] Logs malformed arguments in a way that’s visible in `logs/run.log` without breaking the run.
- [ ] Researcher node:
  - [ ] Uses a **jsonrepair‑style parsing strategy** analogous to SDD tickets/architect parsing to recover slightly malformed JSON plans.
  - [ ] On hard failure, falls back to 1–2 **goal‑derived queries** instead of `"Analyze project"` (e.g. `"<goal text>"`, `"best practices <goal tech stack>"`).
  - [ ] Produces `researchResults` that are at least loosely grounded in the goal/domain.
- [ ] Regression:
  - [ ] The React/Vite portfolio scenario no longer fails due to JSON parse errors in coder or researcher; failures, if any, are due to actual stack issues, not JSON formatting.

## Steps

1. **LLM tool‑call robustness**
   - [ ] Update `src/core/llm.ts`:
     - [ ] Wrap `JSON.parse(tc.function.arguments)` in a try/catch.
     - [ ] On failure, keep `args` as the raw string and log at `warn`/`debug` level.
     - [ ] Ensure callers that rely on `.toolCalls` can still inspect the raw payload.
2. **Researcher plan parsing**
   - [ ] Update `src/agent/nodes/researcher.ts`:
     - [ ] Strip ``` fences if present (mirroring SDD tickets).
     - [ ] Attempt normal JSON parse; on failure, use `jsonrepair`.
     - [ ] If parsing still fails, construct a minimal plan object with sensible defaults.
3. **Fallback query strategy**
   - [ ] Replace `"Analyze project"` fallback with goal‑aware queries:
     - [ ] Primary: the original goal text (or a compressed version).
     - [ ] Secondary: “best practices”/“modern approach” + tech stack hints when available.
   - [ ] Ensure fast/smoke profiles still use shallow web search, but with these improved queries.
4. **Telemetry & documentation**
   - [ ] Add logging around repaired JSON and fallback paths to make debugging easy (e.g., log a short preview of the raw content).
   - [ ] Document in `docs/KB.md` under “LLM Contracts & Robustness”:
     - [ ] expected JSON‑only behaviour,
     - [ ] how the system repairs or degrades gracefully when providers misbehave.

## Affected Files

- `src/core/llm.ts`
- `src/agent/nodes/researcher.ts`
- `docs/KB.md` (LLM robustness section)

## Tests

- [ ] Unit tests:
  - [ ] `callChat` with mock tool_calls where `arguments` is:
    - [ ] valid JSON string,
    - [ ] slightly malformed JSON (`{"a":1,}`),
    - [ ] non‑JSON string (`"echo hi"`),
    - and confirm no throw and correct `args` shape.
  - [ ] `researcherNode` with:
    - [ ] well‑formed JSON plan,
    - [ ] fenced JSON,
    - [ ] broken JSON repaired successfully,
    - [ ] no plan → fallback queries derived from goal.
- [ ] Behavioural tests:
  - [ ] Simulate an LLM returning malformed JSON for researcher and assert that we still perform goal‑related web searches.

## Risks & Edge Cases

- Over‑reliance on `jsonrepair` could conceal truly broken contracts; mitigated by:
  - Keeping logs of repaired content,
  - Treating repeated parse failures as signals for Snitch/failure metrics (future ticket).
- Passing raw string arguments may surface into downstream logic that assumes objects; callers must be defensive and are expected to guard with `typeof === "string"`.

## Dependencies

- Builds on SDD JSON‑hardening work:
  - Ticket 26 (patch generation & structured edits),
  - Ticket 29 (prompt hardening & policy alignment),
  - SDD tickets JSON repair logic in `src/agent/graphs/sdd_orchestrator.ts`.

