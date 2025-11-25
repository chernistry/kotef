# Ticket: 26 Patch Generation Hardening & Structured Edit Path

Spec version: v1.2  
Context: `.sdd/architect.md`, `.sdd/best_practices.md` (diff-first, safe file writes), `agentic_systems_building_best_practices.md` (tool contracts, schema enforcement), `Prompt_Engineering_Techniques_Comprehensive_Guide.md` (structured outputs, hallucination mitigation), `src/tools/fs.ts`, `src/agent/nodes/coder.ts`, `src/agent/prompts/coder.md`.  
Dependencies: 20 (repo understanding), 21 (eval harness), 24 (error-first strategy).

## Objective & DoD

Make `write_patch` and patch generation robust against:

- malformed diffs containing markdown, `<tool_call>` tags, or stray prose,
- partial / ambiguous edits that Diff.applyPatch “sort of” accepts but corrupt code,

by:

- tightening patch tool contracts,
- adding validation and preflight checks,
- and introducing a path for structured edits that don’t rely on the model hand-rolling unified diff syntax.

### Definition of Done

- [ ] `writePatch` rejects clearly invalid patch content with actionable error messages:
  - [ ] Guards against markdown fences (```), XML/HTML-ish tags, and `<tool_call>` artifacts.
  - [ ] Rejects diffs that don’t contain at least one `@@` hunk header or leading `+/-` lines.
  - [ ] When rejecting, returns a concise message instructing the LLM to regenerate a clean diff.
- [ ] Coder prompt and tools:
  - [ ] Strongly discourage chain-of-thought or metadata around diffs; tools expect **raw unified diffs only**.
  - [ ] Provide a canonical example of a minimal patch.
- [ ] A new “structured edit” path is available:
  - [ ] Add an optional `apply_edits` tool that accepts JSON hunks and internally computes diffs using `diff` library, bypassing direct diff authoring by the model.
  - [ ] For models that handle JSON well, this becomes the preferred path.
- [ ] Tests:
  - [ ] Cover patch rejection for the specific failure case observed (`<tool_call>` contamination).
  - [ ] Cover valid diffs to ensure OK content is not accidentally blocked.

## Implementation Sketch

### 1. Harden `writePatch` in `src/tools/fs.ts`

Extend `writePatch`:

- Before calling `Diff.applyPatch`, run cheap validation on `diffContent`:

```ts
const forbiddenPatterns = [/```/, /<tool_call>/i, /<\/?code>/i];
for (const pat of forbiddenPatterns) {
  if (pat.test(diffContent)) {
    throw new Error(
      'Patch rejected: contains non-diff markup (e.g. markdown fences or tool_call tags). ' +
      'Provide a clean unified diff with no markdown or XML/HTML tags.'
    );
  }
}
```

- Ensure there is at least some diff structure:

```ts
const hasHunkHeader = diffContent.includes('@@');
const hasPlusMinus = /^[+-].+/m.test(diffContent);
if (!hasHunkHeader && !hasPlusMinus) {
  throw new Error(
    'Patch rejected: content does not look like a unified diff. ' +
    'Use @@ hunk headers and +/- lines as in standard unified diff format.'
  );
}
```

- Keep existing `Diff.applyPatch` failure check; its error becomes a second layer of validation.

### 2. Coder prompt: tighten patch instructions

In `src/agent/prompts/coder.md`:

- Add a dedicated “Patch Rules” section:
  - “When using `write_patch`, you must output a **plain unified diff**, with no surrounding markdown fences (no ```), no `<tool_call>` blocks, and no natural language.”
  - Provide a short, correct example:

```diff
@@ -1,3 +1,4 @@
 import React from "react";
 
 function App() {
+  console.log("Hello");
   return <div>Hello</div>;
 }
```

- Explicitly state that chain-of-thought, commentary, and tool metadata go **before** the tool call in your own reasoning, **never inside** the diff string.

### 3. New structured edit tool: `apply_edits`

Add a new tool in `coder`:

```ts
{
  type: 'function',
  function: {
    name: 'apply_edits',
    description: 'Apply a JSON-described set of text edits to a file; the runtime will compute and apply a diff.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              range: {
                type: 'object',
                properties: {
                  start: { type: 'number' },
                  end: { type: 'number' }
                },
                required: ['start', 'end']
              },
              oldText: { type: 'string' },
              newText: { type: 'string' }
            },
            required: ['range', 'newText']
          }
        }
      },
      required: ['path', 'edits']
    }
  }
}
```

Implementation:

- In coder’s tool loop, implement `apply_edits` by:
  - Reading the file,
  - Applying edits in a safe order (e.g. from bottom to top by `range.start`),
  - Generating a diff via `Diff.createTwoFilesPatch` for logging and consistency,
  - Writing the new content via `writeFile`.

This gives us a more deterministic path for models that can handle JSON but struggle with `diff` syntax.

### 4. Error propagation and agent feedback

- When `writePatch` throws due to invalid patches, catch the error in `coder`’s tool loop and:
  - Return a concise JSON object with `kind: 'patch_error'`, `message`, and maybe an example of expected format.
  - This allows the model to self-correct on the next turn.

### 5. Alignment with best practices

These changes follow the external docs’ guidance:

- Treat tools as strict APIs with explicit contracts.
- Use structured outputs (JSON) for complex operations.
- Fail fast and loudly on malformed outputs to avoid silent corruption.

## Steps

1. **Patch validation**
   - [ ] Implement basic structural and contamination checks in `writePatch`.
   - [ ] Add meaningful error messages for rejection reasons.

2. **Prompt updates**
   - [ ] Update `coder` prompt with explicit patch rules and example.

3. **Structured edits**
   - [ ] Implement `apply_edits` in coder’s tool set.
   - [ ] Implement underlying edit logic and diff generation.

4. **Error surfacing**
   - [ ] Ensure coder responds to patch errors with structured feedback rather than vague messages.

5. **Testing**
   - [ ] Unit tests for `writePatch` validation:
     - Diffs containing markdown fences or `<tool_call>` → rejected.
     - Minimal valid diffs → accepted.
   - [ ] Tests for `apply_edits`:
     - Simple insertion, deletion, and replacement cases.

## Affected Files / Modules

- `src/tools/fs.ts`
- `src/agent/nodes/coder.ts`
- `src/agent/prompts/coder.md`
- `test/tools/fs_writePatch.test.ts`
- `test/agent/coder_apply_edits.test.ts`

## Risks & Edge Cases

- Overly strict validation could block legitimate edge-case diffs; tests should include a variety of well-formed diffs to avoid this.
- `apply_edits` introduces another surface for bugs if edit ranges are mis-specified; guard against out-of-bounds and misordered edits.

## Non-Goals

- Rewriting all patch usage in the system to use `apply_edits` immediately; legacy `write_patch` remains supported, just hardened.
- Implementing a full AST-aware refactoring engine; we stay at text-diff level here.


