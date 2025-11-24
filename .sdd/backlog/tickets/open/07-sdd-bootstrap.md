# Ticket: 07 SDD Bootstrap & Auto-Spec Builder

Spec version: v1.0  
Context: `.sdd/project.md` (Definition of Done: auto-SDD mode), `.sdd/architect.md` (Orchestrator / Agent Sketch – Bootstrap / Spec-Builder node), `.sdd/best_practices.md` (research + SDD governance)  
Dependencies: 01-scaffold-core, 02-tools-fs, 03-tools-search, 04-agent-graph, 05-cli-entrypoint.

## Objective & DoD
Enable kotef to take a **plain-text user goal + repo path** (with no existing `.sdd/` directory) and:
- perform best-practice research for the target stack/domain,
- synthesize initial SDD artifacts for that repo,
- wire these artifacts into the normal agent flow so subsequent runs behave as if a human had authored `.sdd/`.

**Definition of Done:**
- [ ] `src/agent/bootstrap.ts` implemented with a top-level function:
  - `bootstrapSddForProject(cfg: KotefConfig, rootDir: string, goal: string): Promise<void>`.
- [ ] Bootstrap flow:
  - [ ] inspects the target repo (basic file tree scan) to infer stack hints (TS/JS, frameworks, etc.),
  - [ ] performs web/deep research using existing tools (`web_search`, `deep_research`) guided by `.sdd/best_practices.md`,
  - [ ] generates or updates:
    - `.sdd/project.md` (project description + Definition of Done inferred from the goal),
    - `.sdd/best_practices.md` (linking to global best practices and any project-specific research),
    - `.sdd/architect.md` (implementation-ready architecture sketch for the target project),
    - at least one ticket in `.sdd/backlog/tickets/open/` that can be executed by the coding agent.
- [ ] Bootstrap is idempotent and safe:
  - if `.sdd/` already exists, it **does not** blindly overwrite; it either:
    - appends/updates clearly delimited sections, or
    - writes new files under `.sdd/bootstrap/` and reports that manual merge is required.
- [ ] CLI `kotef run` path:
  - when invoked against a repo **without** `.sdd/`, calls `bootstrapSddForProject` once, then proceeds with a normal agent run.
- [ ] A small integration test (or scenario in Ticket 06) demonstrates bootstrapping a toy repo with no `.sdd/` into a usable SDD.

## Implementation Sketch

```ts
// src/agent/bootstrap.ts
export interface BootstrapContext {
  cfg: KotefConfig;
  rootDir: string;
  goal: string;
}

export async function bootstrapSddForProject(
  cfg: KotefConfig,
  rootDir: string,
  goal: string,
): Promise<void> {
  // 1) scan repo to infer language/framework
  // 2) run web_search / deep_research for best practices
  // 3) call LLM (callChat) with SDD-style prompts to draft project.md, architect.md, tickets
  // 4) write files under .sdd/ using fs tools (diff-first if files already exist)
}
```

High-level bootstrap pipeline:
1. **Repo scan** – use FS tools to list key files (`package.json`, `tsconfig.json`, major entrypoints) and infer stack.
2. **Best-practice research** – call `deepResearch` with prompts derived from `.sdd/best_practices.md` and the inferred stack.
3. **Project spec synthesis** – use `callChat` with a “project spec” prompt (inspired by `brain/.sdd/prompts/01_research.prompt.md` and `02_architect.prompt.md`) to draft:
   - `.sdd/project.md` tailored to the user’s goal + repo reality,
   - a minimal `.sdd/architect.md` describing components and constraints.
4. **Ticket generation** – use another LLM call (prompt inspired by `03_agent.prompt.md`) to create 1–N tickets in `.sdd/backlog/tickets/open/`.
5. **Write artifacts** – call FS tools to create `.sdd/` and write files:
   - ensure directories exist,
   - respect diff-first policy if any SDD files are present.

Bootstrap prompts should **reuse structure** from the SDDRush `brain/` prompts but be clearly adapted for “target repo” use (avoid hardcoding paths like `personal_projects/kotef`).

## Steps
1. Design types and skeleton for `src/agent/bootstrap.ts` (`BootstrapContext`, `bootstrapSddForProject`).
2. Implement a simple repo scanner:
   - look for `package.json`, `tsconfig.json`, `pnpm-lock.yaml`/`package-lock.json`, key `src` or `app` directories;
   - capture a short text summary (stack hints) to feed into the LLM.
3. Define bootstrap prompts:
   - either load and adapt templates from `brain/.sdd/prompts/01_research.prompt.md` / `02_architect.prompt.md` / `03_agent.prompt.md`,
   - or create dedicated prompts in `src/agent/prompts/bootstrap_*.md` that follow the same SDD structure (project → architect → tickets).
4. Implement `bootstrapSddForProject`:
   - orchestrate repo scan → research → spec synthesis → ticket generation;
   - call `fs` tools to create `.sdd/` and files, using diff-based writes if files exist.
5. Integrate with CLI (Ticket 05):
   - when `kotef run` is invoked with `--goal` (or similar) and no `.sdd/` is found, call `bootstrapSddForProject` before constructing the LangGraph agent and running the ticket.
6. Add a lightweight integration test (or scenario stub to be completed in Ticket 06) that:
   - creates a temp repo with a tiny TS project and **no** `.sdd/`,
   - calls `bootstrapSddForProject`,
   - asserts that `.sdd/project.md`, `.sdd/architect.md`, and at least one ticket file now exist.

## Affected Files
- `src/agent/bootstrap.ts`
- `src/agent/prompts/bootstrap_*.md` (or reuse prompts from `brain/` with a loader)
- `src/cli.ts` (integration hook)
- Tests under `test/agent/bootstrap.test.ts` (or similar)

## Tests
```bash
npm test test/agent/bootstrap.test.ts
```

## Risks & Edge Cases
- Generating overly generic or incorrect SDD for complex repos (mitigate by clearly marking bootstrap artifacts and allowing manual refinement).
- Overwriting hand-crafted `.sdd/` content if present (mitigate by using diff-first behavior and appending to well-delimited sections or separate `bootstrap/` files).
- Cost/latency spikes during bootstrap runs if research is too aggressive (respect `maxRunSeconds`, `maxTokensPerRun`, and `maxWebRequestsPerRun` from `KotefConfig`).

## Non‑Goals / Pitfalls to Avoid
- Do **not** try to fully reverse-engineer a large legacy codebase in this ticket; aim for a **useful starting SDD**, not perfection.
- Do **not** hardcode any specific cloud provider or model; use `KotefConfig` model settings and follow best_practices for modelFast/modelStrong.
- Do **not** bypass existing tools (fs, web_search, deep_research); bootstrap must go through the same tool stack the rest of the agent uses. 

