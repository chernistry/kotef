# Ticket: 07 Ticket Generation Aware of Existing Code

Spec version: v1.0  
Context: SDD orchestrator in `src/agent/graphs/sdd_orchestrator.ts`, project summary in `src/agent/utils/project_summary.ts`, code index utilities (ts‑morph / tree‑sitter) if available, ticket template `sdd/template_driver.ts`. Targets architecture review problem **#16 (Ticket generation ignores existing code structure)** and research doc section **1 / 2** (Code Map, hybrid index).

## Objective & DoD

Make SDD ticket generation aware of existing code so that:

- tickets do not ask to (re‑)implement modules/functions that already exist;
- architect/ticket prompts see a **Code Map** style overview of main modules and entrypoints;
- future work on semantic search / embeddings can plug into the same structure.

### Definition of Done

- [ ] SDD orchestrator passes a short project/code summary into both architect and ticket prompts.
- [ ] `buildProjectSummary` (or a new helper) produces a **Code Map** summarizing at least:
  - main app entrypoints (e.g. Next.js pages, API routes),
  - key modules/services by file path.
- [ ] Ticket planning (“PLAN_ONLY” phase) receives this Code Map and is explicitly instructed not to create tickets for already‑existing modules unless they need changes.
- [ ] At least one test/manual run shows that architect/ticket output references existing modules instead of inventing entirely new top‑level structures when not needed.

## Implementation Sketch

### 1. Extend Project Summary to a Lightweight Code Map

- In `src/agent/utils/project_summary.ts`:
  - Add optional fields to the returned `ProjectSummary`, e.g.:

    ```ts
    export interface ProjectSummary {
      projectType: string;
      languages: string[];
      frameworks: string[];
      mainEntryPoints?: string[]; // e.g. pages/_app.tsx, main.ts, app/router.ts
      keyModules?: string[];      // e.g. src/services/*.ts, src/lib/*.ts
    }
    ```

  - Implement simple heuristics using filesystem patterns (no heavy AST work in this ticket):
    - For JS/TS: find `pages/**`, `app/**`, `src/index.*`, `src/main.*`.
    - For backend: `src/api/**`, `server/**`, etc.

### 2. Wire Code Map into SDD Orchestrator

- In `src/agent/graphs/sdd_orchestrator.ts`:
  - Import `buildProjectSummary`.
  - When constructing metadata (in `loadProjectMetadata` or in `sddResearch`), build a `ProjectSummary` once and serialize a short Code Map string, e.g.:

    ```ts
    const summary = await buildProjectSummary(rootDir, config);
    const codeMapSnippet = [
      `Project type: ${summary.projectType}`,
      `Frameworks: ${summary.frameworks.join(', ')}`,
      `Main entrypoints: ${(summary.mainEntryPoints || []).join(', ')}`,
      `Key modules: ${(summary.keyModules || []).slice(0, 15).join(', ')}`
    ].join('\n');
    ```

  - Pass `codeMapSnippet` into:
    - architect prompt template (`renderBrainTemplate('architect', ...)`),
    - tickets prompt (`orchestrator_tickets` runtime prompt) as an extra placeholder, e.g. `{{CODE_MAP}}`.

### 3. Prompt Updates for Architect & Tickets

- Update relevant templates:
  - In SDD brain templates used by `renderBrainTemplate('architect' | 'ticket')`:
    - Add a new “Existing Code Map” section and instruct the model:
      - to reference existing modules/functions when planning changes;
      - to avoid creating new high‑level modules that duplicate existing ones.
  - In `src/agent/prompts/body/orchestrator_tickets.md` (or equivalent runtime prompt):
    - Add input `{{CODE_MAP}}`.
    - Add guidance: “When proposing tickets, prefer updating existing modules listed in the code map over introducing new top‑level modules unless there is a clear reason.”

### 4. Keep Scope Small, Defer Embeddings

- Do **not** introduce embeddings or heavy AST analysis in this ticket.
- Document in the ticket’s notes that a follow‑up could:
  - build a proper multi‑language code index,
  - add a `search_code` tool on top of that.

## Steps

1. **Extend project summary**
   - [ ] Enrich `ProjectSummary` with `mainEntryPoints` and `keyModules` and implement basic filesystem‑pattern heuristics.
2. **Pass Code Map to SDD orchestrator**
   - [ ] Build a Code Map snippet and add it to architect and tickets prompts via new placeholders.
3. **Prompt hardening**
   - [ ] Update architect/ticket templates to reference the Code Map and avoid duplicating existing structures.
4. **Manual validation**
   - [ ] Run SDD orchestration on an existing project and confirm that generated tickets reference existing modules (e.g. “Update `src/features/dashboard.tsx`”) instead of inventing new top‑level packages unnecessarily.

## Affected Files

- `src/agent/utils/project_summary.ts`
- `src/agent/graphs/sdd_orchestrator.ts`
- `sdd/template_driver.ts` (templates for architect/ticket)
- `src/agent/prompts/body/orchestrator_tickets.md`

## Risks & Non‑Goals

- **Risk:** Heuristics misclassify some files or miss important modules.  
  **Mitigation:** Keep behaviour additive (only extra context to LLM); do not rely on this for correctness.
- **Non‑goal:** Full semantic code search or embeddings; this ticket is a low‑effort, high‑leverage step towards code‑aware ticketing.

