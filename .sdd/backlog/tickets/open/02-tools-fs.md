# Ticket: 02 Tools – Safe File System

Spec version: v1.0  
Context: `.sdd/project.md` (Definition of Done: diff-first editing, workspace safety), `.sdd/architect.md` Sections 2 (File Safety), 6.2  
Dependencies: 01-scaffold-core (reuses `KotefConfig` and logger).

## Objective & DoD
Implement safe file system tools that enforce workspace boundaries and diff-based editing, consistent with Node’s permission model and SDD guardrails.

**Definition of Done:**
- [ ] `src/tools/fs.ts` implemented with `resolvePath`, `readFile`, `listFiles`, `writePatch`.
- [ ] Path validation logic ensures no access outside workspace root (even if Node permission flags are misconfigured).
- [ ] `writePatch` accepts unified diffs and applies them safely (temp file + atomic rename).
- [ ] `.gitignore` and an explicit allowlist are respected when listing files.
- [ ] Unit tests cover path traversal attempts, large file handling, binary file edge cases, and valid patch application.

## Implementation Sketch

```ts
// src/tools/fs.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface FsContext {
  rootDir: string;
}

export function resolvePath(ctx: FsContext, relativePath: string): string {
  const abs = path.resolve(ctx.rootDir, relativePath);
  if (!abs.startsWith(path.resolve(ctx.rootDir) + path.sep)) {
    throw new Error(`Path escapes workspace root: ${relativePath}`);
  }
  return abs;
}

export async function readFile(ctx: FsContext, relativePath: string): Promise<string> {
  const full = resolvePath(ctx, relativePath);
  const data = await fs.readFile(full, 'utf8');
  // Optionally enforce max size and text-only.
  return data;
}
```

`writePatch` should:
- take `(ctx: FsContext, relativePath: string, diffText: string)`;
- parse the unified diff (use a small diff library or a well-defined internal parser);
- apply it to the original content in memory;
- write to `<file>.kotef.tmp` and then `rename` to the original name.

## Steps
1. Design `FsContext` and integrate it with `KotefConfig.rootDir` from Ticket 01.
2. Implement `resolvePath` with strong guarantees (no `..` escapes, no following symlinks outside root).
3. Implement `readFile` with:
   - a maximum file size (e.g. configurable via `KotefConfig`);
   - clear error on binary or oversized files.
4. Implement `listFiles(pattern)` using `fast-glob` or similar:
   - honor `.gitignore`;
   - provide at least one function to “list candidate code files” (e.g. `src/**/*.ts`, configurable).
5. Implement `writePatch` as described above, including:
   - detection of patch applying to a file that does not exist;
   - no-ops when patch results in identical content;
   - safe temp file strategy.
6. Add comprehensive tests in `test/tools/fs.test.ts`:
   - attempts to access `../outside` must throw;
   - basic diff applied correctly;
   - invalid diff fails cleanly (no partial write).

## Affected Files
- `src/tools/fs.ts`
- `test/tools/fs.test.ts`

## Tests
```bash
npm test test/tools/fs.test.ts
```

## Risks & Edge Cases
- Symbolic links pointing outside `rootDir` (must not be followed without explicit design).
- Large or binary files that should not be loaded entirely into memory.
- Partial patch application leaving file in corrupt state (mitigated by temp-file + rename).
