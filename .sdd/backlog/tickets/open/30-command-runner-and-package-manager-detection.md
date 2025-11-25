# Ticket: 30 Command Runner & Package Manager Detection

Spec version: v1.3  
Context: `.sdd/architect.md` (Tools Layer / test_runner), `.sdd/best_practices.md` (Performance & Cost Guardrails), `.sdd/context/arch_refactor.md` (sections 4.3–4.5), existing implementation in `src/tools/test_runner.ts`, command detection in `src/agent/utils/verification.ts`.  
Dependencies: 10 (execution profiles & command policy), 17 (goal‑aware verification), 19 (performance & tool‑use efficiency), 27 (preflight verification).

## Objective & Definition of Done

Upgrade the command execution pipeline so that:

- the agent runs build/test/dev commands via a **robust, modern process runner** with clear timeouts and error classification, and
- it **auto‑detects the package manager and test/build commands** in a way that is:
  - aligned with real‑world Node projects (npm/yarn/pnpm/bun),
  - less brittle than the current heuristics,
  - easy to extend for future stacks.

The outcome should be a more reliable Verifier and better diagnostics for Coder, without changing the high‑level LangGraph architecture.

### Definition of Done

- [ ] `runCommand` uses a modern process library (e.g. `execa`) instead of bare `child_process.exec`, with:
  - [ ] configurable timeouts per profile (`strict` vs `yolo`) and per command type (tests vs dev server),
  - [ ] robust capturing of `stdout`/`stderr`,
  - [ ] clear classification of `failureKind` (`compilation`, `test_failure`, `timeout`, `runtime_error`, `unknown`).
- [ ] A **package manager detection** layer is added:
  - [ ] detects `npm` / `yarn` / `pnpm` / `bun` using a small library (e.g. `detect-package-manager`) and presence of lockfiles,
  - [ ] exposes a normalized API (e.g. `detectPackageManager(rootDir): { name, runCmd }`),
  - [ ] is used by `detectCommands` so planners/verifiers don’t hard‑code `npm`.
- [ ] PATH and env for child processes are sanitized:
  - [ ] uses `npm-run-path` (or equivalent) to include local `node_modules/.bin`,
  - [ ] avoids leaking secrets or host‑specific env into logs.
- [ ] Verifier and Coder:
  - [ ] continue to work with the new runner,
  - [ ] surface clearer `failureSummary` values in `testResults` / logs when commands fail.
- [ ] New tests cover:
  - [ ] success and failure paths for `runCommand`,
  - [ ] detection of at least npm + yarn + pnpm project layouts,
  - [ ] behaviour when no package manager is detected (fallback / helpful error).

## Steps

1. **Design runner API**
   - [ ] Review `src/tools/test_runner.ts` and how `runCommand` is used by `verifierNode` and other code.
   - [ ] Define a small, stable API for command execution (e.g. `runCommand(cfg, cmd, opts?)` plus a thin wrapper if needed).
   - [ ] Decide on reasonable defaults for timeouts based on execution profiles and `.sdd/best_practices.md`.

2. **Integrate execa (or equivalent)**
   - [ ] Add `execa` as a dependency (or alternative with similar API).
   - [ ] Refactor `runCommand` to use it with:
     - [ ] explicit `cwd` set to `cfg.rootDir`,
     - [ ] configurable `timeoutMs`,
     - [ ] consistent trimming of `stdout`/`stderr`.
   - [ ] Preserve and improve `FailureKind` classification logic using combined output.

3. **Add package manager detection**
   - [ ] Introduce a small helper (e.g. `src/tools/package_manager.ts`) using `detect-package-manager` or a minimal hand‑rolled detector:
     - lockfile‑based detection (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`),
     - optional reading of `package.json` scripts via `read-package-json`.
   - [ ] Expose a normalized `runScript(scriptName: string)` that:
     - [ ] resolves to the correct command for the detected package manager,
     - [ ] fails fast with a helpful error if no package manager is found.

4. **Wire into command detection**
   - [ ] Update `src/agent/utils/verification.ts` so `detectCommands`:
     - [ ] uses `runScript('test')` / `runScript('build')` to construct commands when appropriate,
     - [ ] continues to fall back to existing heuristics for non‑Node stacks.
   - [ ] Make sure the Verifier prompt and node still describe and use the same set of commands (`primaryTest`, `buildCommand`, `lintCommand`, `diagnosticCommand`).

5. **Observability & safety**
   - [ ] Ensure `runCommand` logs:
     - [ ] the command (without secrets),
     - [ ] duration,
     - [ ] exit code and `failureKind`.
   - [ ] Confirm that commands run under the same security constraints defined in `.sdd/architect.md` (no unbounded network, no arbitrary package installs unless explicitly allowed in a future ticket).

6. **Tests**
   - [ ] Add `test/tools/test_runner_execa.test.ts` (or extend existing runner tests) to cover:
     - [ ] a successful command,
     - [ ] a timed out command,
     - [ ] a failing test command that is classified as `test_failure`.
   - [ ] Add tests for `package_manager` helper:
     - [ ] detection of each supported PM from a small fixture directory,
     - [ ] fallback behaviour when no lockfile is present.

## Affected files/modules

- `.sdd/architect.md` (Tools Layer section: update to mention execa‑based runner and PM detection).
- `.sdd/best_practices.md` (Performance / command policies: document timeouts & limits).
- `src/tools/test_runner.ts`
- `src/tools/package_manager.ts` (new)
- `src/agent/utils/verification.ts`
- `src/agent/nodes/verifier.ts`
- `src/agent/nodes/coder.ts`
- `test/tools/test_runner_execa.test.ts` (new)
- `test/agent/verification_*` tests if they rely on specific command formatting.

## Tests

- `npm test -- test/tools/test_runner_execa.test.ts`
- `npm test -- test/agent/verification_policy.test.ts`
- `npm test -- test/agent/verifier_sanity.test.ts`

## Risks & Edge Cases

- Mis‑detecting the package manager in exotic setups (e.g. monorepos with multiple lockfiles); mitigate by:
  - keeping detection simple and scoped to `cfg.rootDir`,
  - logging which lockfile was used.
- Changing how commands are executed may surface previously hidden flakiness; mitigate with a feature flag or config to fall back to the old runner temporarily.
- Timeouts that are too aggressive could kill slow but valid test suites; start with generous defaults and refine later based on run logs.

## Dependencies

- Upstream tickets:
  - 10‑execution‑profiles‑and‑command‑policy
  - 17‑goal‑aware‑verification‑and‑test‑selection
  - 19‑performance‑and‑tool‑efficiency‑optimizations
  - 27‑preflight‑verification‑and‑syntax‑sanity‑for‑edits
- Downstream tickets (proposed):
  - 31‑diagnostics‑log‑and‑error‑aware‑planning
  - 32‑lsp‑diagnostics‑and‑advanced‑verification
  - 35‑supervisor‑level‑progress‑controller‑and‑stuck‑handler


