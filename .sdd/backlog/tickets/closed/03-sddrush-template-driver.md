# Ticket: 03 SDDRush Template Driver for Target Projects

Spec version: v1.0  
Context: `.sdd/project.md` (SDD as brain, auto-SDD mode), `.sdd/architect.md` (SDD layer),  
`brain/templates/*` (copied from SDDRush), `personal_projects/sdd/templates/*` (upstream reference)  
Dependencies: 01-scaffold-core, 02-tools-fs (closed but assumed implemented).

## Objective & DoD
Expose the existing SDDRush templates under `brain/templates/` as a **TypeScript prompt driver** that kotef can use to:
- render `01_research`, `02_architect`, `03_agent`, and ticket templates for any target repo,
- fill in placeholders (project name, description, stack, domain, year),
- drive the “research → architect → tickets” phases interactively, without touching the underlying SDD templates.

**Definition of Done:**
- [ ] A small TS module (e.g. `src/sdd/template_driver.ts`) implemented with:
  - [ ] `loadBrainTemplate(kind: 'research' | 'architect' | 'agent' | 'ticket' | 'architect_delta'): string`
  - [ ] `renderBrainTemplate(kind, context): string` that performs placeholder substitution for `{{PROJECT_NAME}}`, `{{PROJECT_DESCRIPTION_CONTENT}}`, `{{DOMAIN}}`, `{{TECH_STACK}}`, `{{YEAR}}`, etc.
- [ ] Templates are read from `brain/templates/*.md` (not duplicated), or, if copied, are clearly marked as derived from SDDRush and kept structurally identical.
- [ ] The driver has no hard-coded project paths (like `personal_projects/kotef`); it operates on a generic `SddPromptContext` derived from the target repo and user goal.
- [ ] Basic tests exist to confirm:
  - [ ] all expected template kinds can be loaded,
  - [ ] placeholder substitution works for a sample context,
  - [ ] missing templates or placeholders fail with clear errors.

## Implementation Sketch

```ts
// src/sdd/template_driver.ts
export type BrainTemplateKind =
  | 'research'
  | 'architect'
  | 'agent'
  | 'ticket'
  | 'architect_delta';

export interface SddPromptContext {
  projectName: string;
  projectDescription: string;
  domain: string;
  techStack: string;
  year: number;
}

export function loadBrainTemplate(kind: BrainTemplateKind): string {
  // resolve to brain/templates/<kind>_template.md
}

export function renderBrainTemplate(
  kind: BrainTemplateKind,
  ctx: SddPromptContext,
): string {
  // simple placeholder replacement; no heavy templating library required for MVP
}
```

You MAY:
- directly borrow template-loading and substitution ideas from `bin/sdd-prompts` in the original `sddrush` repo,
- copy template content if necessary (for runtime prompts or deltas), as long as:
  - you keep a clear link back to `brain/templates/*`,
  - you do not silently change semantics vs upstream SDDRush templates.

## Steps
1. Inspect `brain/templates/*.md` and `personal_projects/sdd/templates/*.md` to understand placeholder usage and naming.
2. Design `SddPromptContext` so it can be filled from CLI/graph (user goal + repo scan).
3. Implement `loadBrainTemplate` with a simple mapping from `BrainTemplateKind` to filenames under `brain/templates/`.
4. Implement `renderBrainTemplate` for placeholder substitution, including:
   - graceful handling of missing fields,
   - a clear error if an unknown placeholder is found.
5. Add tests under `test/sdd/template_driver.test.ts` to:
   - load each template kind,
   - render with a synthetic context and assert key strings appear (e.g. project name, stack).

## Affected Files
- `src/sdd/template_driver.ts`
- `test/sdd/template_driver.test.ts`

## Tests
```bash
npm test test/sdd/template_driver.test.ts
```

## Risks & Edge Cases
- Divergence between `brain/templates/*` and upstream SDDRush templates; mitigate by keeping them structurally in sync.
- Placeholder mismatches leading to malformed prompts; mitigate with strict tests and clear error messages.

## Non‑Goals / Pitfalls to Avoid
- Do **not** modify the original SDDRush templates’ intent; the driver should adapt them, not redesign them.
- Do **not** bake in any kotef-specific file paths or repo assumptions into the templates themselves; keep everything driven by `SddPromptContext`. 

