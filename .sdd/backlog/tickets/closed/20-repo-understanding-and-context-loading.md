# Ticket: 20 Repo Understanding & Context Loading

Spec version: v1.2  
Context: `.sdd/architect.md` (SDD as brain, Code Standards), `.sdd/best_practices.md` (SDD as Source of Truth, Safe diff‑first edits), runtime nodes `src/agent/nodes/{planner.ts,coder.ts,researcher.ts}`, tools `list_files`, `read_file`, and runtime prompts.  
Dependencies: 16 (prompt refactor), 17 (verification policy).

## Objective & DoD

Ensure that the agent:

- **systematically inspects the repository** and relevant files before making decisions,
- uses SDD and existing code as primary context,
- and never attempts to “solve” tasks blindly based on prior or SDD alone.

This addresses cases where the agent:

- fails to notice missing hooks or incorrect import paths,
- ignores existing best_practices or architect decisions,
- or applies generic stack defaults (e.g. TS/Node) to a Python project.

### Definition of Done

- [ ] Planner, Coder, and Researcher nodes:
  - [ ] Always perform an initial **repo scan** appropriate to the task:
    - `list_files("**/*.{ts,tsx,js,jsx,py,md,json,yml,yaml}")` or a targeted pattern.
    - `read_file` on key entrypoints (e.g. `app.py`, `src/index.tsx`, `package.json`).
  - [ ] Use these observations in their prompts and decision logic.
- [ ] A small **project summary** is stored in state at the start of each run, capturing:
  - [ ] language(s) detected (Python/TS/etc.),
  - [ ] presence of frontend frameworks, test frameworks,
  - [ ] key config files (e.g. `vite.config`, `pytest.ini`, `tsconfig.json`).
- [ ] Researcher:
  - [ ] Uses project summary and SDD stack hints to tailor research queries (feed into ticket 15).
- [ ] Coder:
  - [ ] Reads existing implementation files for the goal (e.g. `index.html` for HTML tasks, `app.py` for GUI tasks) before writing new ones.

## Implementation Sketch

### 1. Project Summary Helper

Add `src/agent/utils/project_summary.ts`:

```ts
export interface ProjectSummary {
  languages: string[];           // ['python', 'typescript', 'javascript']
  hasFrontend: boolean;
  hasBackend: boolean;
  hasTests: boolean;
  configFiles: string[];         // e.g. ['package.json', 'vite.config.ts']
  mainFiles: string[];           // e.g. ['app.py', 'src/main.tsx']
}

export async function buildProjectSummary(rootDir: string): Promise<ProjectSummary> { /* ... */ }
```

Implementation ideas:

- Use `list_files("**/*")` once and derive:
  - languages from file extensions,
  - presence of `package.json`, `pyproject.toml`, `vite.config.*`,
  - presence of `tests/`, `__tests__/`, `*.test.*`.

Store `ProjectSummary` in state.

### 2. Planner Integration

Planner node:

- On first invocation, ensure `ProjectSummary` exists; if not, call `buildProjectSummary`.
- Pass summary into planner prompt, so the LLM can:
  - decide whether to treat the repo as Python, Node, or mixed,
  - adjust expectations about commands and frameworks.

### 3. Coder Integration

Coder node:

- Before first code changes:
  - Use `ProjectSummary` to identify main file(s) for the goal.
  - `read_file` those files into context.
- Adjust Coder prompt to emphasise:
  - “Always read the file you are about to change before editing it.”
  - “Use repo structure to decide where new files should go (e.g. in `frontend/src/components` for UI changes).”

### 4. Researcher Integration

Researcher node:

- Use `ProjectSummary` + goal to produce a concise **stack hint**, e.g.:

```json
{ "stack": "Python GUI", "frontend": false, "backend": false }
```

- Feed this into deepResearch (ticket 15) so we don’t pull irrelevant stack guidance (e.g. Node/TS for a pure Python repo).

## Steps

1. **Implement project summary**
   - [ ] Implement `buildProjectSummary` and unit tests with small fixture repos.

2. **State integration**
   - [ ] Add `projectSummary?: ProjectSummary` to `AgentState`.
   - [ ] Ensure the summary is built once per run and reused.

3. **Planner & Coder changes**
   - [ ] Update planner and coder nodes/prompts to consume `projectSummary`.

4. **Researcher changes**
   - [ ] Update Researcher to pass stack hints from `projectSummary` into `deepResearch`.

5. **Smoke tests**
   - [ ] Run kotef on:
     - [ ] Python‑only repo.
     - [ ] Node/Vite repo.
     - [ ] Mixed repo.
   - [ ] Confirm behaviour and research queries adapt correctly.

## Affected Files / Modules

- `src/agent/utils/project_summary.ts` (new)
- `src/agent/state.ts`
- `src/agent/nodes/{planner.ts,coder.ts,researcher.ts}`
- `src/agent/prompts/{planner.md,coder.md,researcher.md}`
- `test/agent/project_summary.test.ts` (new)

## Risks & Edge Cases

- Very large repos may make `list_files("**/*")` expensive; consider:
  - limiting depth,
  - or using a narrower pattern first (e.g. key directories).

## Non‑Goals

- This ticket does **not** implement a full semantic understanding of the codebase; it focuses on light‑weight structural awareness.


