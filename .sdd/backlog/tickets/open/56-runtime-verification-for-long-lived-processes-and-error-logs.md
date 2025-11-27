# Ticket: 56 Runtime verification for long-lived processes and error logs

Spec version: v1.0 / kotef-verifier-runtime-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — Verification Strategy, Quality & Operations, Observability sections.
- Current implementation:
  - Verifier node (`src/agent/nodes/verifier.ts`):
    - selects a small set of verification commands based on profile (`strict`/`fast`/`smoke`/`yolo`) and detected stack (`detectedCommands`),
    - runs each command once via `runCommand` from `src/tools/test_runner.ts` (which internally uses `runCommandSafe` from `src/tools/command_runner.ts`),
    - decides `allPassed` purely from `exitCode`/`passed` flags and optionally LSP diagnostics,
    - passes `results` + `diagnosticsSummary` into an LLM prompt (`verifier.md`) to determine `decision.next` and `decision.status`,
    - enforces fail-closed semantics in `strict` profile if `allPassed === false`.
  - `runCommand`/`runCommandSafe`:
    - enforce a timeout (e.g. 30s/60s); return `exitCode`, `stdout`, `stderr`, and `timedOut`.
  - No explicit notion of **long-lived processes** (e.g. servers, bots) whose correctness depends on runtime behaviour *after* startup.
  - No generic integration with **runtime logs** (e.g. `handlers.messages - ERROR - ...`) beyond what the process prints to stdout/stderr during the short timeout window.
- Observed issue (from `logs/run.log`):
  - Kotef runs:

    ```bash
    cd /Users/sasha/IdeaProjects/personal_projects/tgbot && timeout 3s python3 bot.py 2>&1 || true
    ```

    The bot starts successfully, exits with code 0 within 3s; Verifier sees `passed = true`.
  - Later, when the human runs the bot (e.g. via `watchmedo auto-restart`), real runtime errors appear:

    ```text
    handlers.messages - ERROR - Error for user 5927508593: Request URL is missing an 'http://' or 'https://' protocol.
    ```

    or:

    ```text
    handlers.messages - ERROR - Error for user 5927508593: Client error '401 Unauthorized' for url ...
    ```

  - Planner still reports:

    > "Success. Bot error when handling non-command messages has been fixed. All tests pass (3/3)."

    even though runtime log clearly shows failures when a user sends a message.

Problem:
- Verifier treats “process started and exited cleanly in a few seconds” as success, but:
  - does not simulate **real user behaviour** (e.g. posting a Telegram message);
  - does not inspect **recent logs** for ERROR/Exception markers after startup;
  - LLM-based evaluation only sees the short `results` array, not the asynchronous runtime behaviour.

This leads to **false positives** for bots/servers/daemons: Kotef reports “done” even when runtime error paths are obviously broken.

## Objective & Definition of Done

Objective:
- Extend verifier so that for **long-lived / server-like processes** it:
  - distinguishes “startup OK” from “runtime behaviour OK”;
  - optionally performs a **structured runtime probe** (e.g. send test input) when safe and cheap;
  - inspects relevant logs for ERROR/Exception patterns in a recent time window;
  - only reports `done` when both startup and basic runtime probes/logs are clean, or clearly marks the run as `partial` / `blocked` with reasons.

### Definition of Done

- Process classification:
  - [ ] Verifier (and/or `detectCommands`) can classify certain commands as **long-lived services** (e.g. `python bot.py`, `uvicorn app:app`, `npm run dev`, `flask run`) vs quick tests/builds.
  - [ ] For long-lived commands, verifier uses a **service verification strategy** instead of treating a short `timeout 3s <cmd>` as full success.

- Runtime probes:
  - [ ] Verifier supports a notion of **functional probes** for services (building on ticket 28 “functional probes and goal-first verification”):
    - e.g. “send a Telegram message”, “perform a simple HTTP GET”, or “invoke a CLI command against the running service”.
  - [ ] For the tgbot example:
    - a minimal placeholder probe is defined at the SDD level (e.g. documented in `.sdd/architect.md` / project spec) such as:
      - “when verifying tgbot, after starting `python bot.py`, send a synthetic message to the bot or call a small local CLI stub that simulates one”.
    - Verifier records these probes via `recordFunctionalProbe` so they are visible in `functionalChecks`.

- Log inspection:
  - [ ] Verifier can perform **log-based verification** when:
    - a service writes to a known log file or stream (e.g. `logs/run.log`, or a project-specific log path in SDD),
    - or when recent run log (kotef’s own logs) clearly contains runtime ERROR/Exception entries for the just-modified project.
  - [ ] Implementation:
    - A small helper (e.g. `src/agent/utils/logs.ts`) can:
      - read the tail (e.g. last N KB) of one or more log files specified in SDD (`.sdd/project.md` / `.sdd/architect.md` or a project-local config),
      - scan for patterns like `ERROR`, `Traceback`, `Exception`, and project-specific error prefixes (e.g. `handlers.messages - ERROR -`),
      - filter entries occurring **after** a reference timestamp (run start or verification start).
  - [ ] Verifier:
    - incorporates these log findings into `currentDiagnostics` or a new `logDiagnostics` field;
    - treats presence of serious errors in the log window as a **verification failure** (especially for strict/fast profiles).

- Decision semantics:
  - [ ] For long-lived processes:
    - `allPassed` is **not** considered true unless:
      - startup command succeeded (within timeout),
      - functional probes (if any) pass or are absent,
      - recent logs show no severe runtime errors for the verified project.
  - [ ] If logs show errors or probes fail:
    - Verifier sets `allPassed = false`;
    - LLM decision is given explicit context about failing logs and probes;
    - in `strict` profile, `decision.next === 'done'` is disallowed;
    - in `fast`/`smoke`, `decision.terminalStatus` should lean toward `done_partial` or `aborted_constraint`, not full success.

## Implementation Sketch

### 1. Service detection heuristics

- Extend `DetectedCommands` / `detectCommands` (`src/agent/utils/verification.ts`) to flag commands that likely start a service:
  - heuristics:
    - commands containing `python bot.py`, `python3 bot.py`, `uvicorn`, `gunicorn`, `flask run`, `fastapi`, `npm run dev`, etc.;
    - SDD hints: `.sdd/architect.md`/project-specific specs may list the main run command(s).
  - Add a field like:

```ts
interface DetectedCommands {
  // existing fields...
  serviceCommands?: string[]; // e.g. ['python bot.py']
}
```

- Verifier:
  - if a command selected for verification matches a `serviceCommands` entry (or heuristic), treat it via **service verification strategy**:
    - short startup check (existing `timeout 3s python3 bot.py` pattern) is only the first step, not the final verdict.

### 2. Runtime log tail helper

- Add `src/agent/utils/logs.ts` (or extend `diagnostics.ts`) with:

```ts
export interface LogErrorEntry {
  source: 'service_log' | 'project_log';
  file: string;
  message: string;
  timestamp?: number;
}

export async function scanLogsForErrors(
  rootDir: string,
  options: { logPaths: string[]; sinceMs?: number }
): Promise<LogErrorEntry[]> { /* ... */ }
```

- Behaviour:
  - For each log path (relative to `rootDir` or absolute):
    - read only the last N KB (e.g. 64–128 KB) to avoid huge files;
    - regex-match candidate error lines:
      - `/ERROR/i`, `/Exception/`, `/Traceback/`, and project-specific prefixes like `handlers.messages - ERROR -`;
    - optionally parse timestamps if present in log format;
    - filter to entries newer than `sinceMs` when possible.

### 3. Verifier integration

- Track verification start time:
  - At the top of `verifierNode`, capture `const verificationStart = Date.now();`.
- After running commands and updating `currentDiagnostics`:
  - For projects where SDD indicates a service + log file (e.g. via `.sdd/project.md` or `.sdd/architect.md`), call `scanLogsForErrors` with:
    - `rootDir = cfg.rootDir`,
    - `logPaths` derived from SDD (for kotef itself, this might be `logs/run.log`, while for target repo it might be `./logs/*.log` or a specific path),
    - `sinceMs = verificationStart - delta` (small buffer).
- Convert log entries into DiagnosticsEntry-like objects and merge with `currentDiagnostics`:
  - `source: 'service_log'`,
  - `message: <log line>`,
  - optionally encode `severity` as `error` when pattern matches.
- If any severe errors are found relevant to the verified service:
  - set `allPassed = false`;
  - append a short `failureHistory` record indicating “runtime log errors detected”.

### 4. Functional probes for services

- Leverage `recordFunctionalProbe` (`src/agent/utils/functional_checks.ts`) and ticket 28:
  - define/extend a way to declare service-level probes in SDD:
    - e.g. `.sdd/architect.md` for a repo might say:
      - “For tgbot, a minimal probe is: send a test Telegram message with text 'ping'; expect a reply within N seconds.”
  - For generic frameworks (HTTP servers), a probe could be:
    - “HTTP GET on `/healthz` should return 200 within 2s.”
- Verifier:
  - when a service command is detected and the profile/budget allow it:
    - run a probe command/script (e.g. `python probe.py` or `curl http://localhost:...`);
    - record the result as functional probe;
    - use `deriveFunctionalStatus` to incorporate this into `functionalOk`.
- For now, tgbot-specific probes can be documented but not auto-run if they require real external Telegram traffic—keep the design generic and safe.

### 5. LLM prompt updates

- Update `src/agent/prompts/body/verifier.md` to:
  - include a summary of runtime log diagnostics and functional probes in its context (e.g. `{{DIAGNOSTICS}}` already exists; ensure log-derived diagnostics are clearly labeled);
  - explicitly instruct Verifier LLM:
    - to **treat log ERROR/Exception entries after verification start as failures** or, at minimum, reasons for `partial`/`blocked`;
    - not to declare full success when runtime errors are still present in logs, even if startup commands passed.

## Steps

1. **Service detection**
   - [ ] Extend `DetectedCommands` and `detectCommands` to mark probable service commands.
2. **Log scanning utilities**
   - [ ] Implement `scanLogsForErrors` with tail-reading and pattern matching.
3. **Verifier integration**
   - [ ] Capture `verificationStart` and call `scanLogsForErrors` for service projects.
   - [ ] Merge log errors into `currentDiagnostics` and adjust `allPassed`.
4. **Functional probes**
   - [ ] Ensure functional probes for services can be declared in SDD and recorded by Verifier.
5. **Prompt & docs**
   - [ ] Update `verifier.md` and `.sdd/architect.md` to describe runtime verification semantics for services.
6. **Tests**
   - [ ] Add tests simulating:
     - a service with clean startup and clean logs → Verifier can consider success;
     - a service with clean startup but runtime ERROR in logs → Verifier marks failure/partial;
     - non-service commands remain unaffected.

## Affected files / modules
- `.sdd/architect.md` (Verification Strategy, Observability sections)
- `src/agent/nodes/verifier.ts`
- `src/agent/utils/verification.ts` (DetectedCommands / service detection)
- `src/agent/utils/diagnostics.ts` or new `src/agent/utils/logs.ts`
- `src/agent/utils/functional_checks.ts`
- `src/agent/prompts/body/verifier.md`
- Tests under `test/agent/verification_*` or new tests focused on service verification.

## Risks & Edge Cases
- Reading large logs:
  - Mitigation: always tail only the last N KB and limit the number of matched lines.
- Over-sensitivity to benign ERROR logs:
  - Mitigation: pattern lists should be tuned; allow project-specific overrides in SDD.
- Probes that hit real external services (e.g. Telegram, OpenRouter):
  - Mitigation: by default only log-based verification is used; probes requiring network should be opt-in and clearly noted in SDD.

