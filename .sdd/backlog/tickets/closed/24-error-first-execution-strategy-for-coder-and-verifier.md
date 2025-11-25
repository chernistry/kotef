# Ticket: 24 Error-First Execution Strategy for Coder & Verifier

Spec version: v1.2  
Context: `.sdd/architect.md`, `.sdd/best_practices.md` (feedback-driven loops, diff-first edits), `agentic_systems_building_best_practices.md` (error-first, short feedback cycles), `Prompt_Engineering_Techniques_Comprehensive_Guide.md` (policy-style prompts, explicit strategies), runtime nodes `src/agent/nodes/{coder.ts,verifier.ts,planner.ts}`, `src/agent/utils/verification.ts`.  
Dependencies: 20 (repo understanding & stack detection), 23 (configurable coder turn budget).

## Objective & DoD

Shift the agent from “junior-level exploration-first” to “staff-level error-first” behaviour:

- first run a targeted diagnostic command to **see real failures** (build/test),
- then apply focussed fixes,
- then re-run the same diagnostic to validate,

instead of spending dozens of tool turns passively reading files.

### Definition of Done

- [ ] There is a clearly defined **error-first strategy** encoded in prompts and code:
  - [ ] For tasks involving compilation/tests (most feature work), the **first tool call** in coder is a diagnostic command (`npm run build`, `npm test`, `pytest`, etc.) when such a command is detectable.
  - [ ] For tiny tasks (e.g. typos, micro-doc fixes), the system is allowed to skip heavy diagnostics (respecting task scope + profile).
- [ ] `verifier` and `coder` share a common detection of stack & commands:
  - [ ] `detectCommands` in `src/agent/utils/verification.ts` provides:
    - primary test command,
    - build command (if any),
    - lint / syntax-check command (if any),
    - and an explicit `diagnosticCommand` recommendation.
- [ ] Coder node:
  - [ ] Exposes a dedicated `run_diagnostic` tool that:
    - [ ] Resolves the appropriate diagnostic command using `detectCommands`.
    - [ ] Runs it once per run (cached) and returns structured output.
  - [ ] Prompt explicitly instructs: “If the goal is non-trivial code work, call `run_diagnostic` as your first action.”
- [ ] Verifier node:
  - [ ] Reuses the same `diagnosticCommand` when running final checks where appropriate.
- [ ] Behaviour observed in logs:
  - [ ] For a normal TS/Node repo with a `build` or `test` script, the agent’s first action is to run that command and base subsequent edits on actual error messages.

## Implementation Sketch

### 1. Extend `detectCommands` with a diagnostic recommendation

In `src/agent/utils/verification.ts`:

- Augment `DetectedCommands`:

```ts
export interface DetectedCommands {
  stack: ProjectStack;
  primaryTest?: string;
  smokeTest?: string;
  buildCommand?: string;
  lintCommand?: string;
  diagnosticCommand?: string; // NEW
}
```

- In detection logic:
  - Node / Vite:
    - Prefer `npm run build` if present, else `npm test`, else `npm run lint`.
  - Python:
    - Prefer `pytest`, else `python -m compileall .` or a simple `python -m py_compile` pass if tests are absent.
  - Go:
    - Prefer `go test ./...`, else `go build`.

Set `diagnosticCommand` accordingly.

### 2. Coder: `run_diagnostic` tool and first-turn policy

In `src/agent/nodes/coder.ts`:

- Add a new tool definition:

```ts
{
  type: 'function',
  function: {
    name: 'run_diagnostic',
    description: 'Run the best-fit build/test command once to see real errors before making changes.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['auto', 'build', 'test', 'lint'],
          description: 'Hint about which diagnostic to prioritise; default is auto.'
        }
      },
      required: []
    }
  }
}
```

- Implementation inside the tool loop:
  - Maintain a local `diagnosticRun` flag in coder to ensure at most one “auto” diagnostic run per node invocation.
  - On `run_diagnostic`:
    - If `diagnosticRun` already true and args.kind === 'auto', return a message: `"Diagnostic already executed; reuse previous output."`.
    - Else:
      - Call `detectCommands(cfg)` to get `DetectedCommands`.
      - Choose the command:
        - If `args.kind` is provided, prefer the corresponding command type.
        - Otherwise, use `detected.diagnosticCommand`.
      - If no command is available, return a structured explanation and instruct the model to fall back to targeted `run_command` or `run_tests`.
      - Run via `runCommand(cfg, cmd)`.
      - Return `{ command, stdout, stderr, exitCode, passed }`, and set `diagnosticRun = true`.

- State: optionally attach the command/result into `fileChanges` or add a new `diagnostics` field in `AgentState` for use by planner/verifier later. This can be incremental; minimally, returning it in the tool output is enough for coder’s internal iteration.

### 3. Prompt changes for coder & planner

Update `src/agent/prompts/coder.md`:

- Make error-first policy explicit, in the “Policies & Guardrails” section:
  - “For non-trivial coding tasks (new features, refactors, failing builds/tests), your **first action** should be to call `run_diagnostic` to execute the best available build/test command.”
  - “Use its output to pick the **smallest change** that moves the error state forward (fix the topmost, most blocking error first).”
  - “Only skip diagnostics for clearly tiny tasks (e.g. typo fix in README) and when profile/scope indicates `tiny`.”

Update `src/agent/prompts/planner.md`:

- Encourage planner to request diagnostics via `needs.tests` explicitly when goals clearly involve builds/tests.
- Clarify that, in `yolo` mode, it should still prefer an error-first step rather than broad exploration.

### 4. Verifier: reuse diagnostic strategy

In `src/agent/nodes/verifier.ts`:

- After `detectCommands(cfg)` call, when building `commandsToRun`:
  - For `strict` profile:
    - Continue current behaviour (test + build + lint).
  - For `fast` profile:
    - Prefer `detected.diagnosticCommand` if present; this aligns the final verifier check with the initial diagnostic.
  - For `smoke` / `yolo`:
    - Keep existing lightweight behaviour, but consider using `diagnosticCommand` for at least one quick check when scope is not `tiny`.

### 5. Scope & Profile Interaction

Respect `TaskScope` and `ExecutionProfile`:

- `tiny` + non-strict:
  - Allow coder to **not** run diagnostics if the goal clearly mentions micro-changes (typo, comment, log message).
- `strict`:
  - Always run a diagnostic first unless a strong reason is present in the SDD (e.g. extremely slow monolith build).

This aligns with best practices around cost-aware error-first loops: default to diagnostics, but let scope and profile guard extreme cases.

## Steps

1. **Detection**
   - [ ] Extend `DetectedCommands` with `diagnosticCommand`.
   - [ ] Implement detection heuristics for Node/Vite/Python/Go.

2. **Coder tools**
   - [ ] Add `run_diagnostic` tool definition.
   - [ ] Implement its logic, including caching and fallbacks when no suitable command is found.
   - [ ] Add logging around diagnostic execution.

3. **Prompts**
   - [ ] Update `coder` prompt with error-first policy and concrete examples.
   - [ ] Update `planner` prompt to favour diagnostics via `needs.tests` and `run_diagnostic`.

4. **Verifier alignment**
   - [ ] Update verifier to prefer `diagnosticCommand` when picking commands, especially in `fast` profile.

5. **Testing**
   - [ ] Unit tests for `detectCommands` to ensure `diagnosticCommand` is chosen reasonably for:
     - Node repo with `build` script,
     - Node repo with only `test` script,
     - Python repo with/without tests,
     - Go repo with `go.mod`.
   - [ ] Integration-style coder tests (mocked LLM) asserting the first tool call in non-tiny tasks is `run_diagnostic`.

## Affected Files / Modules

- `src/agent/utils/verification.ts`
- `src/agent/nodes/coder.ts`
- `src/agent/nodes/verifier.ts`
- `src/agent/prompts/{coder.md,planner.md}`
- `test/agent/verification_detect_commands.test.ts` (extended)
- `test/agent/coder_error_first_strategy.test.ts` (new)

## Risks & Edge Cases

- Repos without any sensible build/test command:
  - Diagnostic must degrade gracefully and instruct coder to fall back to reading files and inferring the right command.
- Very slow builds in `strict` mode:
  - May need tighter timeouts or documentation; consider integration with command policies to avoid unbounded runs.

## Non-Goals

- Designing a fully adaptive, learned strategy for when to run which command; this ticket encodes a deterministic, heuristic strategy.
- Implementing multi-command diagnostics; we stick to a single best-fit command for now.


