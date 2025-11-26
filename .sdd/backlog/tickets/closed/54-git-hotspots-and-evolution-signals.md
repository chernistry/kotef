# Ticket: 54 Git hotspots and evolution signals for planner

Spec version: v1.0 / kotef-sd-approaches-v1

## Context
- Architect spec:
  - `.sdd/architect.md` — Repo understanding, Technical Debt & Refactoring Backlog.
- SD-approaches context:
  - `.sdd/context/sd_approaches.md` — sections 1.2 (Architecture and long-term evolution, evolutionary architecture), 3.8 (Git history / evolution awareness).
- Existing implementation:
  - Ticket 20 “Repo Understanding & Context Loading”:
    - project summary (languages, config files, tests).
  - Tickets 48–49:
    - git init/guardrails and per-ticket commits (planned).
  - No current use of **git history** as an input signal for planning or risk.

Modern practice (“code as a crime scene”, hot-spot analysis) suggests using git churn and bug history to identify fragile areas and drive risk-aware decisions.

## Objective & Definition of Done

Objective:
- Add a minimal **git hotspot** capability to Kotef so Planner and Coder can:
  - know which files/modules have high churn or recent bugfixes;
  - treat them as higher-risk, requiring more conservative changes and tests;
  - optionally prioritize tech-debt tickets for such areas.

### Definition of Done

- Git hotspot tool:
  - [ ] `src/tools/git.ts` is extended with a function:

```ts
getHotspots(rootDir: string, opts?: { maxCommits?: number; limit?: number }): Promise<{
  file: string;
  commits: number;
  lastCommitDate?: string;
}[]>
```

  - [ ] It uses `git log` (respecting `maxCommits`) to compute:
    - approximate commit count per file,
    - last modification date.
  - [ ] Returns top-N files (by commits) under the project root (excluding `.sdd`, `node_modules`, etc.).
- Agent state:
  - [ ] `AgentState` gains an optional `gitHotspots?: { file: string; commits: number; lastCommitDate?: string }[]`.
  - [ ] Planner populates this field early in the run if git is enabled and available.
- Planner & Coder prompts:
  - [ ] Planner:
    - [ ] includes a short summary of relevant hotspots in its prompt context when planning work in those files/modules.
  - [ ] Coder:
    - [ ] is informed when editing hotspot files to:
      - keep diffs smaller,
      - add or extend tests,
      - avoid broad refactors unless necessary and well-covered.
- Snitch / risk register:
  - [ ] Snitch, when recording risks in `.sdd/risk_register.md`, may tag entries with whether the involved files are hotspots.

## Implementation Sketch

### 1. Git helper implementation

- In `src/tools/git.ts`:
  - Implement `getHotspots` using a safe wrapper around git:
    - run `git log --name-only --pretty=format:` limited to `maxCommits` (e.g., 500).
    - count occurrences of each file path.
    - filter out non-source directories (`.sdd/`, `node_modules/`, `dist/`, etc.).
  - Handle cases where git is unavailable or repo is missing:
    - return an empty array and log a warning.

### 2. AgentState and planner wiring

- `src/agent/state.ts`:
  - add `gitHotspots` field.
- `plannerNode`:
  - if git is enabled (from config) and not in `dryRun`:
    - call `getHotspots(rootDir)` once per run;
    - store results in `state.gitHotspots`.
  - When building planner prompt context:
    - include a short textual summary (e.g. top 5 hotspots).

### 3. Prompt updates and usage

- `src/agent/prompts/body/planner.md` and potentially `coder.md`:
  - mention:
    - hotspot files as indicators of risk and change cost.
  - Suggest heuristics:
    - prefer targeted fixes and tests in hotspots;
    - record tech-debt tickets if a hotspot is clearly brittle but not fully addressed.

## Steps

1. **Implement `getHotspots`** in `src/tools/git.ts`.
2. **Add `gitHotspots`** to `AgentState` and wire planner to populate it.
3. **Update planner/coder prompts** to use hotspot information.
4. **Optionally wire into risk register** (ticket 51) for better visibility.

## Affected files / modules
- `src/tools/git.ts`
- `src/agent/state.ts`
- `src/agent/nodes/planner.ts`
- `src/agent/prompts/body/planner.md`
- `src/agent/prompts/body/coder.md`
- `.sdd/risk_register.md` (via ticket 51)

## Tests
- Unit:
  - `getHotspots` on a small git repo with known history.
- Integration:
  - end-to-end run where a hotspot file is modified and planner/coder behaviour reflects increased caution.

## Risks & Edge Cases
- Large repos may make `git log` slow.
  - Mitigation: limit `maxCommits` and number of returned files; consider caching.
- Non-git directories:
  - Already addressed by git guardrails (ticket 48); fall back gracefully if no repo.

## Dependencies
- Upstream:
  - 48-git-init-and-guardrails.md
  - 49-git-commits-per-ticket-run.md
- Related:
  - 51-risk-register-and-tech-debt-flow.md

