# Ticket: 38 Coder Turn Budgets and `max_coder_turns` Semantics

Spec version: v1.0  
Context: `.sdd/architect.md` (budgets, stop rules), `.sdd/best_practices.md` (§4 Error‑First Loops, §7 Budgets & Guardrails), CLI contract in `src/cli.ts`, config in `src/core/config.ts`, coder implementation in `src/agent/nodes/coder.ts`, planner budgets in `src/agent/nodes/planner.ts`, run logs showing `configuredMax: 150` but `effectiveMaxTurns: 12` for `fast` profile.

## Objective & DoD

Align `--max-coder-turns` / `MAX_CODER_TURNS` semantics with user expectations and architecture:

- **User intent**: allow raising coder tool‑loop turns beyond profile defaults when needed (e.g. exploratory yolo sessions or heavy refactors), while still staying within global safety bounds.
- **Current bug**: config value is treated as an **upper bound**, clamped via `Math.min(config, profileDefault)`, so higher values (e.g. 150) are ignored and default (12) wins.

### Definition of Done

- [ ] CLI and env config:
  - [ ] `--max-coder-turns` and `MAX_CODER_TURNS` are treated as an **override cap**, not a “must be ≤ default”.
  - [ ] Value `0` (or absence) means “use profile defaults”.
  - [ ] Non‑zero values in range `[1, 500]` are respected, with a global hard safety ceiling (≤ 500 turns per coder node).
- [ ] Coder node:
  - [ ] Logs clearly show `profileDefault`, `configuredMax`, and `effectiveMaxTurns`, with effective turns equal to the **configured** value (when > 0 and ≤ safety ceiling).
- [ ] Planner / progress controller:
  - [ ] Overall agent loop still respects **global budgets** (command/test/web limits) and MAX_STEPS, so raising coder turns does not re‑introduce infinite loops.
- [ ] Regression on the React/Vite portfolio example:
  - [ ] Passing `--max-coder-turns 150` yields `effectiveMaxTurns` ≥ 150 (subject to safety cap), not 12.

## Steps

1. **Config semantics audit**
   - [ ] Review `KotefConfigSchema` and `loadConfig` in `src/core/config.ts` for `maxCoderTurns` validation and env parsing.
   - [ ] Review CLI wiring in `src/cli.ts` to confirm options override env defaults correctly.
2. **Coder node fix**
   - [ ] Update `src/agent/nodes/coder.ts` so that:
     - [ ] `profileDefault` is the baseline.
     - [ ] `cfg.maxCoderTurns > 0` overrides it, clamped only by a **global safety bound** (e.g. max 500).
     - [ ] Logging reflects the actual effective value.
3. **Safety alignment**
   - [ ] Confirm planner’s `BudgetState` (maxCommands/maxTestRuns/maxWebRequests) and `MAX_STEPS` are independent from coder turns and still cap the run.
   - [ ] Confirm `recursionLimit` on the LangGraph invocation remains at 100 (or another safe number) so even very high coder turns do not loop indefinitely.
4. **Documentation**
   - [ ] Update `docs/KB.md` and CLI help text to clarify:
     - [ ] default per‑profile turn limits,
     - [ ] how `--max-coder-turns` interacts with profiles and global safety caps,
     - [ ] recommended ranges for typical use (e.g. 12–40 for fast, 40–200 for yolo exploration).

## Affected Files

- `src/core/config.ts`
- `src/cli.ts`
- `src/agent/nodes/coder.ts`
- `docs/KB.md` (configuration section)

## Tests

- [ ] Unit / integration tests:
  - [ ] With `profile=fast` and no `maxCoderTurns` → effective equals 12.
  - [ ] With `profile=fast` and `maxCoderTurns=30` → effective equals 30.
  - [ ] With `profile=yolo` and `maxCoderTurns=1000` → effective clamped to safety cap (e.g. 500).
  - [ ] Verify logs in tests (or via a lightweight harness) reflect the expected values.

## Risks & Edge Cases

- Very high coder turns in combination with **weak prompts** or misconfigured agents could still waste tokens. Mitigation: rely on:
  - Planner budgets and stop rules (Ticket 14/19/30),
  - Sane default safety cap (500 turns) and clear documentation discouraging extreme configs.

## Dependencies

- Planner budgets and progress controller (Tickets 14, 19, 30, 35) must remain in place to guard against pathological behaviour when coder turns are increased.

