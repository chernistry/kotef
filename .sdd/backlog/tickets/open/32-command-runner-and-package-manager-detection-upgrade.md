# Ticket: 32 Command runner & package manager detection upgrade

Spec version: v1.0  
Context: `.sdd/architect.md` (Tools Layer → test_runner, performance/cost guardrails), `.sdd/best_practices.md` (error-first debugging, safety), `.sdd/context/arch_refactor.md` (Sections 4.3–4.4).

## Context
- `src/tools/test_runner.ts` currently wraps `child_process.exec` via `util.promisify`, with:
  - ad-hoc failure classification,
  - a fixed timeout,
  - no awareness of Node ecosystem details (local `node_modules/.bin`, npm vs pnpm vs yarn vs bun).
- `arch_refactor.md` recommends:
  - adopting a more robust **command runner** (`execa`/`zx`-style),
  - adding **package manager detection** and PATH setup (`detect-package-manager`, `npm-run-path`),
  - reusing these facilities across `run_command`, `run_tests`, diagnostics, and verifier.

## Objective & Definition of Done

Replace the thin `child_process.exec` wrapper with a safer, more robust command runner that:
- Handles timeouts, stdout/stderr collection, exit codes, and signals in a predictable way.
- Automatically respects local project tools (`node_modules/.bin`) and detected package manager.
- Provides a single, reusable API for all command execution in the agent (`run_command`, `run_tests`, Verifier).

DoD:
- New `CommandRunner` utility with:
  - explicit config (cwd, timeout, env, whether to inherit stdio),
  - unified `CommandResult` shape.
- `test_runner.runCommand` and any other command tools refactored to use this utility.
- Package manager detection and PATH setup integrated, with tests.

## Steps
1. **Introduce CommandRunner abstraction**
   - Add `src/tools/command_runner.ts` that:
     - uses `execa` (or similar) under the hood, with:
       - default timeout (configurable via `KotefConfig`),
       - full stdout/stderr capture,
       - exit code handling,
       - signal on timeout.
     - returns a typed `CommandResult` with fields:
       - `command`, `args`, `exitCode`, `stdout`, `stderr`, `timedOut`, `killed`, `startTime`, `endTime`.

2. **Package manager detection & PATH**
   - Add a small helper in the same module:
     - detect `npm` vs `yarn` vs `pnpm` vs `bun` using e.g. `detect-package-manager` or equivalent.
     - set up PATH correctly using `npm-run-path` so that local `node_modules/.bin` commands are available.
   - Store detection result in state or a light cache so we don’t re-detect on every command.

3. **Refactor test_runner**
   - Rewrite `src/tools/test_runner.ts` to delegate process execution to `CommandRunner`.
   - Keep and extend `FailureKind`/`failureSummary` classification logic, but base it on the richer `CommandResult`.
   - Expose a clear API surface for:
     - `runCommand(cfg, command, timeoutMs?)`,
     - potentially `runCommandWithPM(cfg, scriptName)`, which uses the detected package manager.

4. **Update agent nodes**
   - Ensure `coder` and `verifier` use the upgraded test runner:
     - check `src/agent/nodes/coder.ts` usage of `runCommand` and adjust if signatures changed.
     - confirm that `detectCommands` still works and, if needed, can request “run this npm script” instead of raw `npm run ...` strings.

5. **Config & SDD alignment**
   - Wire any new config knobs (e.g. `commandTimeoutMs`, `packageManagerStrategy`) into `KotefConfig` and `.sdd/architect.md`:
     - document defaults and safe ranges,
     - keep sensible defaults for DevTime/Cost vs SecRisk.

6. **Tests**
   - Add unit tests for `command_runner.ts` under `test/tools/command_runner.test.ts`:
     - simple success, failure, timeout scenarios.
   - Update existing tests:
     - `test/tools/search.test.ts` / others that might rely on commands (if any).
     - `test/agent/verification_policy.test.ts` and `test/agent/verifier_sanity.test.ts` to ensure nothing regressed.

## Affected files/modules
- `src/tools/command_runner.ts` (new).
- `src/tools/test_runner.ts` (refactor).
- `src/agent/nodes/coder.ts`, `src/agent/nodes/verifier.ts` (if API changes).
- `src/core/config.ts` (optional config knobs).
- Tests under `test/tools/*` and `test/agent/*`.

## Tests
- `npm test -- test/tools/command_runner.test.ts`
- `npm test -- test/agent/verifier_sanity.test.ts`
- `npm test -- test/agent/verification_policy.test.ts`

## Risks & Edge Cases
- **Platform differences** (Windows vs Unix):
  - execa handles most cases, but we must be careful with shell vs direct executable execution.
- **Breaking existing scripts**:
  - changes in PATH or package manager detection could alter behaviour on repos with unusual setups; mitigate by starting with conservative detection and allowing overrides.

## Dependencies
- Builds on existing `test_runner` and `detectCommands` logic.
- Upstream for Tickets 31 (diagnostics log) and 34 (LSP diagnostics), which will rely on robust command execution for lint/typecheck/LSP processes.

