import { promises as fs } from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import * as Diff from 'diff';

export interface FsContext {
    rootDir: string;
}

/**
 * Resolves a relative path to an absolute path within the rootDir.
 * Throws if the path escapes the rootDir.
 */
export function resolvePath(ctx: FsContext, relativePath: string): string {
    const abs = path.resolve(ctx.rootDir, relativePath);
    // Ensure the path is within the rootDir
    // We add a separator to ensure we don't match partial prefixes (e.g. /root vs /root_suffix)
    const rootWithSep = path.resolve(ctx.rootDir) + path.sep;
    if (!abs.startsWith(rootWithSep) && abs !== path.resolve(ctx.rootDir)) {
        throw new Error(`Path escapes workspace root: ${relativePath}`);
    }
    return abs;
}

/**
 * Reads a file as a UTF-8 string.
 * Enforces a max size limit (default 1MB for now, can be config driven later).
 */
export async function readFile(ctx: FsContext, relativePath: string): Promise<string> {
    const fullPath = resolvePath(ctx, relativePath);
    const stats = await fs.stat(fullPath);

    if (stats.size > 1024 * 1024) { // 1MB limit
        throw new Error(`File too large: ${relativePath} (${stats.size} bytes)`);
    }

    return fs.readFile(fullPath, 'utf8');
}

/**
 * Lists files matching a pattern, respecting .gitignore.
 */
export async function listFiles(ctx: FsContext, pattern: string | string[]): Promise<string[]> {
    // fast-glob handles .gitignore if we tell it to, but it's a bit tricky with 'ignore' option.
    // We'll use the 'ignore' option manually or rely on standard excludes.
    // For now, we'll exclude node_modules and .git by default.

    const patterns = Array.isArray(pattern) ? pattern : [pattern];

    const entries = await fg(patterns, {
        cwd: ctx.rootDir,
        ignore: ['**/node_modules/**', '**/.git/**', '**/.sdd/**'], // Standard ignores
        dot: true,
        absolute: false,
    });

    return entries;
}

/**
 * Applies a unified diff to a file.
 * The diff must target a single file.
 */
export async function writePatch(ctx: FsContext, relativePath: string, diffContent: string): Promise<void> {
    const fullPath = resolvePath(ctx, relativePath);

    // 1. Read original content
    let originalContent = '';
    try {
        originalContent = await fs.readFile(fullPath, 'utf8');
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== 'ENOENT') {
            throw error;
        }
        // If file doesn't exist, we assume original content is empty (creating new file)
        // But usually patches expect a source file. 
        // If the patch is creating a file, the source file in diff header might be /dev/null
        // We'll proceed with empty string and see if patch applies.
    }

    // 2. Apply patch
    // jsdiff.applyPatch returns string or boolean (false if failed)
    const patchedContent = Diff.applyPatch(originalContent, diffContent);

    if (patchedContent === false) {
        throw new Error(`Failed to apply patch to ${relativePath}. Hunk mismatch or invalid diff.`);
    }

    // 3. Write to temp file
    const tempPath = `${fullPath}.kotef.tmp`;
    await fs.writeFile(tempPath, patchedContent as string, 'utf8');

    // 4. Atomic rename
    await fs.rename(tempPath, fullPath);
}
