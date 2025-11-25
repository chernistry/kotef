# Ticket: 23 Configurable Coder Turn Budget & CLI Flag

Spec version: v1.2  
Context: `.sdd/architect.md`, `.sdd/best_practices.md`, `agentic_systems_building_best_practices.md` (time/compute guardrails, safety), `Prompt_Engineering_Techniques_Comprehensive_Guide.md` (policy-style prompts, structured control), runtime nodes `src/agent/nodes/coder.ts`, `src/agent/graph.ts`, config `src/core/config.ts`, CLI `src/cli.ts`.  
Dependencies: 20 (repo understanding), 21 (eval harness), 22 (code hygiene).

## Objective & DoD

Expose the coder tool-loop turn budget as a first-class configuration, wired through:

- env / config (`MAX_CODER_TURNS` → `KotefConfig.maxCoderTurns`),
- CLI flag (`--max-coder-turns`),
- and runtime behaviour in `coder` (overriding per-profile defaults),

so we can:

- tighten or relax exploration for CI vs local runs,
- instrument / tune this parameter over time,
- and avoid “hard-coded magic numbers” in agent behaviour.

### Definition of Done

- [ ] `KotefConfig` supports an optional `maxCoderTurns` integer with sane defaults:
  - [ ] Parsed from env (`MAX_CODER_TURNS`) and validated (`1 <= maxCoderTurns <= 500`).
  - [ ] Optionally overridden by CLI flag `--max-coder-turns`.
- [ ] `coder` node:
  - [ ] Reads an effective `maxTurns` for the current run:
    - `maxTurns = config.maxCoderTurns ?? profileDefaultTurns[executionProfile]`.
  - [ ] Logs the chosen limit (`profile`, `configOverride`, `maxTurns`) at the start of the node.
  - [ ] Enforces `maxTurns` strictly (no off-by-one surprises).
- [ ] `ExecutionProfile` semantics remain intact:
  - [ ] Defaults (strict/fast/smoke/yolo) stay the same when `maxCoderTurns` is unset.
  - [ ] When `maxCoderTurns` is set, it is treated as a hard _upper bound_ for the loop.
- [ ] CLI:
  - [ ] `kotef run` and `kotef chat` accept `--max-coder-turns <n>` and propagate it into `KotefConfig`.
  - [ ] Help text and README mention the flag and env variable.
- [ ] Tests:
  - [ ] Config parsing tests cover env-only, CLI-only, and combined scenarios.
  - [ ] A small integration-style test asserts that coder stops after `N` turns when `maxCoderTurns = N` in mock mode.

## Implementation Sketch

### 1. Config: add `maxCoderTurns`

Update `src/core/config.ts`:

- Extend `KotefConfigSchema` with:

```ts
maxCoderTurns: z.number().int().min(1).max(500).default(0) // 0 = “use profile defaults”
```

and document the “0 means unset / use built-in profile defaults” behaviour in a comment.

- In `loadConfig`, read:

```ts
const maxCoderTurnsEnv = parseInt(env.MAX_CODER_TURNS || '0', 10);
```

with basic validation (non-NaN, clamped to `[0, 500]`) before feeding it to the schema.

### 2. CLI plumbing

In `src/cli.ts`:

- `run` command:
  - Add option: `--max-coder-turns <count>` with description “Hard cap on coder tool-loop turns”.
  - When constructing `cfg`, allow the CLI flag to override env:

```ts
maxCoderTurns: options.maxCoderTurns
  ? parseInt(options.maxCoderTurns, 10)
  : envConfig.maxCoderTurns,
```

(re-using the same range / validation logic as in `loadConfig`).

- `chat` command:
  - Mirror the same option and override semantics, so interactive sessions can also be tuned.

### 3. Coder node: respect `maxCoderTurns`

In `src/agent/nodes/coder.ts`:

- Today the loop does:

```ts
const profileTurns: Record<ExecutionProfile, number> = { ... };
const maxTurns = profileTurns[executionProfile] ?? 20;
```

Replace this with:

```ts
const profileTurns: Record<ExecutionProfile, number> = { ... }; // unchanged
const configuredMax = cfg.maxCoderTurns && cfg.maxCoderTurns > 0 ? cfg.maxCoderTurns : undefined;
const defaultMax = profileTurns[executionProfile] ?? 20;
const maxTurns = configuredMax
  ? Math.min(configuredMax, defaultMax) // config is an upper bound, profile remains meaningful
  : defaultMax;
```

- At the start of the node, log:

```ts
log.info('Coder starting', {
  executionProfile,
  profileDefaultTurns: defaultMax,
  configuredMax: cfg.maxCoderTurns || null,
  maxTurns,
});
```

This makes behaviour debuggable in run logs.

### 4. Graph / state considerations

The LangGraph recursion limit (`recursionLimit`) is orthogonal to this change and should **not** be used for tool loop control. This ticket:

- leaves recursionLimit untouched,
- purely governs the inner `while (turns < maxTurns)` loop inside `coder`.

For future work (not in scope here), we may want to surface an aggregate “budget” metric in `AgentState.metrics` (e.g. total coder turns used), but this ticket focuses only on the control parameter and enforcement.

## Steps

1. **Config & CLI**
   - [ ] Extend `KotefConfigSchema` and `KotefConfig` with `maxCoderTurns`.
   - [ ] Wire env (`MAX_CODER_TURNS`) into `loadConfig`.
   - [ ] Add `--max-coder-turns` to `run` and `chat` commands.
   - [ ] Update README and/or `--help` text.

2. **Coder loop**
   - [ ] Replace in-node hard-coded `maxTurns` with config-aware logic.
   - [ ] Add structured logs describing the chosen limits.

3. **Testing**
   - [ ] Unit tests for `loadConfig` env parsing.
   - [ ] Tests for CLI flag parsing precedence over env.
   - [ ] Coder mock-mode test:
     - Build a minimal `AgentState` and `KotefConfig` with `maxCoderTurns = 1`.
     - Use a fake `chatFn` that always proposes another tool call to verify the loop stops after 1 turn.

4. **Docs**
   - [ ] Update `docs` / README to explain:
     - the distinction between LangGraph recursion limit and coder tool-loop turns,
     - recommended defaults for local dev vs CI.

## Affected Files / Modules

- `src/core/config.ts`
- `src/cli.ts`
- `src/agent/nodes/coder.ts`
- `test/core/config.test.ts` (new or extended)
- `test/agent/coder_turn_budget.test.ts` (new)
- README / docs (brief mention).

## Risks & Edge Cases

- Misconfigured `MAX_CODER_TURNS` (e.g., 0 or huge) could make the agent feel “stupid” (too few turns) or expensive (too many turns); guard with validation and logging so misconfigurations are obvious.
- Downstream tickets (e.g., about planner loop detection or error-first strategy) may later want finer-grained budgets per profile/scope; keep current design simple but not hostile to extension (e.g., we can later add `maxCoderTurnsTiny`, etc., without breaking this contract).

## Non-Goals

- Changing the semantics of execution profiles (`strict`, `fast`, `smoke`, `yolo`) beyond turn-budget override.
- Implementing per-node or per-tool-call budgets; this ticket only touches the coder tool loop as a whole.


