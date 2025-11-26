# Ticket: 48 Git init and guardrails for automated commits

Spec version: v1.0 / kotef-git-integration-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — SDD as “brain”, safety and side-effect discipline.
- Design docs and prior tickets:
  - 20-repo-understanding-and-context-loading.md (repo awareness and project summary).
  - 45-ticket-lifecycle-open-to-closed-and-run-reporting.md.
  - 46-ticket-requirement-for-medium-and-large-tasks.md.
- Current implementation:
  - `src/cli.ts`:
    - `run` and `chat` commands orchestrate ticket execution and write run reports.
    - No built-in git awareness: no repo detection, no git init, no commits.
  - `src/core/config.ts`:
    - Holds global config (`KotefConfig`), but no git-specific settings yet.
  - Tools:
    - `src/tools/command_runner.ts` — generic shell command runner (used by the agent, budgeted).

From the AI-engineering best‑practices docs:
- Side-effectful system actions (like git) should be:
  - deterministic and centralized in explicit tool modules, not left to free-form LLM shell commands;
  - guarded by configuration flags and safe defaults;
  - observable (log what happened, and why).

This ticket lays the groundwork for git integration by:
1) adding a safe, centralized git helper module;  
2) wiring CLI and config to know when git is allowed;  
3) automatically initializing a repo when appropriate (and skipping when `--nogit` or dry-run).

## Objective & Definition of Done

Objective:
- Introduce a **safe git integration layer** that:
  - detects whether the target project is already a git repo;
  - optionally initializes a new repo when none exists;
  - is controlled by config/CLI flags (`--nogit`, dry-run), not by LLM prompts;
  - exposes small, composable operations (init, status, commit) for higher-level features (ticket-level commits in follow-up tickets).

### Definition of Done

- Git configuration:
  - [ ] `KotefConfig` has explicit git-related settings:
    - [ ] `gitEnabled: boolean` (default `true`).
    - [ ] `gitAutoInit: boolean` (default `true`).
    - [ ] `gitBinary?: string` (optional path/name, defaults to `"git"`).
  - [ ] Environment and CLI flags:
    - [ ] CLI supports `--nogit` flag on `run` and `chat` commands.
    - [ ] When `--nogit` is present:
      - [ ] `gitEnabled` is set to `false` for this invocation.
    - [ ] If an env var (e.g. `KOTEF_NO_GIT=1`) exists in `loadConfig`, it also disables git (even without CLI flag).

- Git helper module:
  - [ ] New module `src/tools/git.ts` exists and is the *only* place where git commands are executed.
  - [ ] It exposes at least:
    - [ ] `isGitRepo(rootDir: string): Promise<boolean>`:
      - returns `true` if `git rev-parse --is-inside-work-tree` succeeds in `rootDir`;
      - returns `false` if it fails or `.git/` is missing.
    - [ ] `ensureGitRepo(rootDir: string, opts: { enabled: boolean; autoInit: boolean; dryRun: boolean; logger: Logger }): Promise<boolean>`:
      - if `enabled === false` or `dryRun === true`: logs a message and returns `false` (no git).
      - if `enabled === true` and repo exists: logs and returns `true`.
      - if `enabled === true`, `autoInit === true`, and no repo exists:
        - [ ] logs intent (“initializing git repo”);
        - [ ] runs `git init` (optionally `git init -b main` if supported);
        - [ ] returns `true` on success and `false` on failure.
      - if `enabled === true`, `autoInit === false`, and no repo exists:
        - [ ] logs a clear “git disabled because repo is missing and autoInit=false” message;
        - [ ] returns `false`.
    - [ ] `getGitStatus(rootDir: string): Promise<{ clean: boolean; hasUntracked: boolean } | null>`:
      - returns a minimal parsed view of `git status --porcelain` or `null` if git is disabled/unavailable.
  - [ ] All git commands:
    - [ ] Use a safe subprocess wrapper (e.g. `execa` or Node child_process) with explicit cwd = `rootDir`.
    - [ ] Surface errors as structured results and logs; no unhandled promise rejections.

- CLI wiring:
  - [ ] `kotef run`:
    - [ ] Parses `--nogit` and passes `gitEnabled`/`gitAutoInit` to `KotefConfig`.
    - [ ] After determining `rootDir` and before invoking the agent graph:
      - [ ] Calls `ensureGitRepo(rootDir, { enabled: gitEnabled, autoInit: gitAutoInit, dryRun: cfg.dryRun, logger })`.
      - [ ] Logs whether a repo was found, created, or skipped.
  - [ ] `kotef chat`:
    - [ ] Same behaviour at the start of the session.
  - [ ] Dry-run semantics:
    - [ ] If `cfg.dryRun === true`, `ensureGitRepo` never runs `git init` (just logs that git is skipped).

- Safety & observability:
  - [ ] If git is not installed or `git` commands fail:
    - [ ] the helper logs a warning and returns `false`/`null` instead of throwing;
    - [ ] higher-level code treats this as “git unavailable” and continues without git.
  - [ ] No git command is triggered via LLM tools; the LLM never calls `git` directly.

## Implementation Sketch

### 1. Extend config with git settings

- In `src/core/config.ts`:
  - Add git-related fields to `KotefConfig` (with safe defaults).
  - Read `KOTEF_NO_GIT` and similar env vars to set `gitEnabled` / `gitAutoInit`.
- Ensure the config is passed through to:
  - CLI commands (`run`, `chat`);
  - Agent graph (if needed later for telemetry).

### 2. Implement `src/tools/git.ts`

- Implement helpers as described in DoD, e.g.:
  - Use a small internal helper for running `git` commands with:
    - cwd = `rootDir`;
    - timeouts and basic error handling;
    - logs containing command and exit code.
- Prefer a minimal API surface:
  - `isGitRepo`, `ensureGitRepo`, `getGitStatus`.
- This ticket **does not** yet implement commit logic; that will be covered by a follow-up ticket.

### 3. Wire CLI commands to `ensureGitRepo`

- In `src/cli.ts`:
  - For `run`:
    - Parse `--nogit` (defaults to `false`).
    - Merge CLI options with env config to produce final `gitEnabled` and `gitAutoInit`.
    - Once `rootDir` and `.sdd` have been resolved, call `ensureGitRepo`.
  - For `chat`:
    - Do the same when starting a new goal/session for a given `rootDir`.

### 4. Logging and edge cases

- Add clear logs around git decisions:
  - “Git disabled via --nogit / KOTEF_NO_GIT; skipping repo detection.”
  - “Git repo detected at <rootDir>.”
  - “No git repo detected; initializing one (autoInit=true).”
  - “Git unavailable or git init failed; continuing without git.”
- Ensure dry-run mode is respected: no repo initialization, but logs must mention this explicitly.

## Steps

1. Config:
   - [ ] Extend `KotefConfig` with `gitEnabled`, `gitAutoInit`, `gitBinary?`.
   - [ ] Update `loadConfig` to derive git settings from env vars (e.g. `KOTEF_NO_GIT`, `KOTEF_GIT_AUTO_INIT`).
2. Git helper module:
   - [ ] Implement `src/tools/git.ts` with `isGitRepo`, `ensureGitRepo`, `getGitStatus`.
   - [ ] Add unit tests with temporary directories (with and without `.git`).
3. CLI integration:
   - [ ] Add `--nogit` option to `run` and `chat`.
   - [ ] Call `ensureGitRepo` early in both commands.
4. Logging & docs:
   - [ ] Add log messages for git decisions.
   - [ ] Optionally add a short note in `docs/KB.md` describing the new git behaviour.

## Affected files / modules
- `src/core/config.ts`
- `src/tools/git.ts` (new)
- `src/cli.ts`
- Tests:
  - `test/tools/git.test.ts` (new) or similar.

## Risks & Edge Cases
- Git not installed:
  - Agent must continue without git; this is not a fatal error.
- Repos with unusual layouts (e.g. nested repos):
  - For now, treat `rootDir` as the working tree root and ignore nesting; document this limitation.
- Dry-run mode:
  - Easy to accidentally still run git commands; tests must verify that `dryRun` fully suppresses git side-effects.

## Non-Goals
- Implementing actual commit logic or branch management (covered by a follow-up ticket).
- Interacting with remotes (no `git remote add`, `git push`, etc.).

