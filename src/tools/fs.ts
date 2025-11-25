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

    if (stats.size > 1024 * 1024) {
        throw new Error(`File too large: ${relativePath} (${stats.size} bytes)`);
    }

    return fs.readFile(fullPath, 'utf8');
}

export async function writePatch(filePath: string, diffContent: string): Promise<void> {
    // 1. Validation (Ticket 26)
    const forbiddenPatterns = [/```/, /<tool_call>/i, /<\/?code>/i];
    for (const pat of forbiddenPatterns) {
        if (pat.test(diffContent)) {
            throw new Error(
                'Patch rejected: contains non-diff markup (e.g. markdown fences or tool_call tags). ' +
                'Provide a clean unified diff with no markdown or XML/HTML tags.'
            );
        }
    }

    const hasHunkHeader = diffContent.includes('@@');
    const hasPlusMinus = /^[+-].+/m.test(diffContent);
    if (!hasHunkHeader && !hasPlusMinus) {
        throw new Error(
            'Patch rejected: content does not look like a unified diff. ' +
            'Use @@ hunk headers and +/- lines as in standard unified diff format.'
        );
    }

    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Apply patch
    const result = Diff.applyPatch(content, diffContent);

    if (result === false) {
        throw new Error(
            `Failed to apply patch to ${filePath}. The patch might be malformed or the file content has changed.`
        );
    }

    await fs.writeFile(absolutePath, result, 'utf-8');
}

export interface TextEdit {
    range: { start: number; end: number }; // 0-based character indices
    newText: string;
}

export async function applyEdits(filePath: string, edits: TextEdit[]): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Sort edits descending by start index to avoid shifting offsets
    const sortedEdits = [...edits].sort((a, b) => b.range.start - a.range.start);

    let newContent = content;
    for (const edit of sortedEdits) {
        // Basic bounds check
        if (edit.range.start < 0 || edit.range.end > newContent.length || edit.range.start > edit.range.end) {
            throw new Error(`Invalid edit range: ${JSON.stringify(edit.range)}`);
        }
        newContent = newContent.slice(0, edit.range.start) + edit.newText + newContent.slice(edit.range.end);
    }

    await fs.writeFile(absolutePath, newContent, 'utf-8');
}

/**
 * Writes content to a file, creating directories as needed.
 */
export async function writeFile(ctx: FsContext, relativePath: string, content: string): Promise<void> {
    const fullPath = resolvePath(ctx, relativePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
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
        ignore: ['**/node_modules/**', '**/.git/**', '**/.sdd/**'],
        dot: true,
        absolute: false,
    });

    return entries;
}

/**
 * Applies a unified diff to a file.
 * The diff must target a single file.
 */

