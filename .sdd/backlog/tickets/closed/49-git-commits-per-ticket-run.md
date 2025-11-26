# Ticket: 49 Git commits per ticket run

Spec version: v1.0 / kotef-git-integration-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — SDD as source of truth; progressive hardening of safety and auditability.
- Design docs and related tickets:
  - 20-repo-understanding-and-context-loading.md — project summary and repo awareness.
  - 45-ticket-lifecycle-open-to-closed-and-run-reporting.md — ticket open → closed and run reports.
  - 46-ticket-requirement-for-medium-and-large-tasks.md — enforcing ticket-based work for non-tiny tasks.
  - 48-git-init-and-guardrails.md — git detection and auto-init with safe defaults.
- Current behaviour:
  - Tickets are executed via:
    - `kotef run --ticket <id>` (single-ticket mode).
    - `kotef chat` (SDD orchestration → tickets → sequential execution).
  - Each ticket run:
    - produces a `RunSummary` via `writeRunReport`, with:
      - `status`, `filesChanged`, `tests`, `terminalStatus`, `ticketId`, `ticketPath`, `ticketStatus`.
    - may move the ticket from `open` to `closed` via `ticket_closer`.
  - There is **no automatic git commit**:
    - changes land in the working tree uncommitted;
    - no commit metadata is tied to tickets or run reports.

From the AI-engineering best-practices docs:
- Strong audit trails and reversibility are critical:
  - each unit of automated work should be traceable (what changed, why, when, and by whom/what);
  - tooling should structure side effects (commits) around task units (tickets), not arbitrary LLM decisions;
  - safety: agents should not push or manipulate remotes implicitly.

This ticket introduces **per-ticket git commits**, bound to ticket execution, while respecting `--nogit` and `dryRun`.

## Objective & Definition of Done

Objective:
- After each ticket execution:
  - If git is enabled and a repo exists (per ticket 48), and the run produced changes, then:
    - stage the relevant files; and
    - create a git commit with a deterministic, ticket-based message.
- If no repo exists and `gitAutoInit` is true and `--nogit` is **not** set:
  - the repo should already have been initialized by ticket 48’s logic before ticket execution.

### Definition of Done

- Git commit helper:
  - [ ] `src/tools/git.ts` exposes:
    - [ ] `commitTicketRun(rootDir: string, params: { enabled: boolean; dryRun: boolean; ticketId?: string; ticketTitle?: string; filesChanged: string[]; logger: Logger; }): Promise<{ committed: boolean; hash?: string; reason?: string }>` that:
      - [ ] returns `{ committed: false, reason: 'git disabled' }` if `enabled === false` or `dryRun === true`.
      - [ ] returns `{ committed: false, reason: 'no changes' }` if `filesChanged` is empty.
      - [ ] otherwise:
        - [ ] stages the changed files (e.g. via `git add <filesChanged>`; can fall back to `git add -A` if necessary).
        - [ ] builds a commit message (see below) and runs `git commit`.
        - [ ] parses and returns the resulting commit hash (e.g. via `git rev-parse HEAD`).
        - [ ] logs the outcome (success/failure + hash or reason).
  - [ ] Commit message format:
    - [ ] If `ticketId` and `ticketTitle` are available:
      - `[kotef] Ticket <ticketId>: <ticketTitle>`.
    - [ ] Else, fall back to:
      - `[kotef] Automated changes (no ticket id)`.

- CLI integration: `run --ticket`:
  - [ ] In `src/cli.ts`, for a single-ticket `run`:
    - [ ] After graph invocation and successful `writeRunReport`:
      - [ ] If `result.done === true`:
        - [ ] Extract `filesChanged` from `result.fileChanges`.
        - [ ] Extract `ticketId` (from filename) and `ticketTitle` (first heading line of the ticket’s markdown).
        - [ ] Call `commitTicketRun(rootDir, { enabled: cfg.gitEnabled, dryRun: cfg.dryRun, ticketId, ticketTitle, filesChanged, logger })`.
        - [ ] Do **not** attempt git operations if `gitEnabled === false` or `dryRun === true`.
      - [ ] If `result.done === false`:
        - [ ] Do **not** commit; log that the ticket finished partial/blocked and needs manual review.

- CLI integration: `chat` ticket loop:
  - [ ] In `src/cli.ts`’s chat-mode ticket loop:
    - [ ] After each ticket graph invocation and `writeRunReport`:
      - [ ] If `result.done === true`:
        - [ ] Same commit call as in `run --ticket` (using `ticketId`, `ticketTitle`, `filesChanged`).
      - [ ] If `result.done === false`:
        - [ ] No commit; log a warning for the user.

- Run report enrichment (optional but recommended):
  - [ ] `RunSummary` gains an optional `commitHash?: string`.
  - [ ] `writeRunReport` writes `commitHash` when a commit was created.
  - [ ] For non-git runs or skipped commits, this field is absent or `null`.

- Safety constraints:
  - [ ] No git operations if:
    - [ ] git is disabled via `--nogit` or `KOTEF_NO_GIT`.
    - [ ] `cfg.dryRun === true`.
    - [ ] git is not installed or repo detection fails.
  - [ ] No remote operations:
    - [ ] **No** `git push`, `git remote add`, or similar.
  - [ ] If commit fails (e.g. conflicts, hooks, missing user.name/email):
    - [ ] Log the error clearly.
    - [ ] Do **not** treat this as a fatal error for the ticket run; the ticket remains “done” but with a “commit_failed” note in logs and run report.

## Implementation Sketch

### 1. Extend `src/tools/git.ts` with commit support

- Add a helper that:
  - Normalizes the `filesChanged` list:
    - dedupe paths;
    - ensure they are relative to `rootDir`.
  - If the list is empty:
    - return `{ committed: false, reason: 'no changes' }`.
  - Run:
    - `git add <files...>` (or `git add -A` as a fallback if path lengths are problematic).
    - `git commit -m "<message>"`.
  - On success:
    - run `git rev-parse HEAD` to get `hash`.
    - return `{ committed: true, hash }`.
  - On failure:
    - Log and return `{ committed: false, reason: 'commit failed: <error>' }`.

### 2. Wire into `run --ticket`

- In `src/cli.ts` `run` command:
  - When a ticket file is selected:
    - you already extract `ticketId` from the filename.
  - To get `ticketTitle`:
    - parse the first non-empty line starting with `#` in the ticket markdown and strip leading `#` characters.
  - After the graph result:
    - build `filesChanged` from `result.fileChanges` keys.
    - call `commitTicketRun` if `result.done === true`.
  - Attach `commitHash` (if any) into `RunSummary`.

### 3. Wire into `chat` ticket loop

- In the `kotef chat` ticket loop over open tickets:
  - After each ticket run:
    - use the same helper and logic as in `run --ticket`.
  - Ensure logs surface:
    - commit hash on success;
    - reason for skipping commit (noop, git disabled, dry-run, commit failure).

### 4. Tests and manual verification

- Add tests (where feasible) that:
  - use a temporary directory;
  - create a minimal git repo;
  - simulate a “fake” ticket run with `filesChanged` including one or two files;
  - verify that:
    - commits are created;
    - commit messages follow the expected template;
    - `commitHash` is returned.
- Manual tests:
  - Scenario 1: existing git repo, `run --ticket`, successful ticket.
  - Scenario 2: no git repo, `gitAutoInit=true`, `--nogit` not set:
    - ticket 48’s behaviour should have created a repo; verify a commit is created.
  - Scenario 3: `--nogit` set:
    - ensure no commits are created, even if tickets succeed.
  - Scenario 4: `dryRun=true`:
    - ensure no commits, but logs reflect the skipped commit.

## Steps

1. Implement `commitTicketRun` in `src/tools/git.ts`.
2. Integrate commit calls into:
   - `kotef run --ticket` path in `src/cli.ts`.
   - chat-mode ticket loop in `src/cli.ts`.
3. Extend `RunSummary` and `writeRunReport` to include `commitHash`.
4. Add tests and do manual smoke runs as described.

## Affected files / modules
- `src/tools/git.ts`
- `src/cli.ts`
- `src/agent/run_report.ts`
- Tests:
  - new or extended test files under `test/tools/` and `test/agent/` or a future `test/cli/`.

## Risks & Edge Cases
- Git user identity not configured:
  - Git may refuse to commit without `user.name`/`user.email`; this should be surfaced clearly in logs and the run report.
- Hook failures:
  - Pre-commit hooks may fail; do not hide this.
- Large or binary changes:
  - For now, treat them like any other changes; no special handling is required, but be aware of possible performance implications when staging everything.

## Non-Goals
- Automatic branch management (creating feature branches, merging, rebasing).
- Interacting with remotes (no push, no fetch, no remote configuration).
- Complex commit splitting or interactive staging; for now, one commit per successful ticket run is sufficient.

