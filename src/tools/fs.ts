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

    // Stage 1: Try strict unified diff
    let result = Diff.applyPatch(content, diffContent);

    // Stage 2: Fallback to fuzzy patching if strict failed
    if (result === false) {
        // Only attempt fuzzy fallback for code files
        const ext = path.extname(filePath);
        const isCodeFile = ['.ts', '.tsx', '.js', '.jsx'].includes(ext);

        if (isCodeFile && shouldAttemptFuzzyPatch(diffContent)) {
            try {
                result = await applyFuzzyPatch(content, diffContent);
                console.log(`[fs] Applied fuzzy patch to ${filePath} (strict diff failed)`);
            } catch (fuzzyError) {
                throw new Error(
                    `Failed to apply patch to ${filePath}. ` +
                    `Strict diff failed and fuzzy fallback also failed: ${fuzzyError instanceof Error ? fuzzyError.message : String(fuzzyError)}`
                );
            }
        } else {
            throw new Error(
                `Failed to apply patch to ${filePath}. The patch might be malformed or the file content has changed. ` +
                `File type: ${ext || 'unknown'}. Fuzzy fallback not available for this file type.`
            );
        }
    }

    await fs.writeFile(absolutePath, result, 'utf-8');
}

/**
 * Determines if a fuzzy patch should be attempted.
 * Only for small, localized patches.
 */
function shouldAttemptFuzzyPatch(diffContent: string): boolean {
    const lines = diffContent.split('\n');
    const changeLines = lines.filter(l => l.startsWith('+') || l.startsWith('-'));

    // Only attempt fuzzy for small patches (< 50 changed lines)
    return changeLines.length > 0 && changeLines.length < 50;
}

/**
 * Applies a unified diff using fuzzy matching.
 * This manually parses the unified diff and applies changes with tolerance for context mismatches.
 */
async function applyFuzzyPatch(originalContent: string, diffContent: string): Promise<string> {
    //    Parse hunks from unified diff
    const hunks = parseUnifiedDiffHunks(diffContent);

    if (hunks.length === 0) {
        throw new Error('No valid hunks found in diff');
    }

    let result = originalContent;

    // Apply each hunk with simple fuzzy matching
    for (const hunk of hunks) {
        const { expected, replacement } = hunk;

        // Try exact match first
        if (result.includes(expected)) {
            result = result.replace(expected, replacement);
            continue;
        }

        // If exact match fails, try fuzzy line-by-line matching
        const bestMatch = findBestFuzzyMatch(result, expected);

        if (bestMatch.index === -1 || bestMatch.score < 0.6) {
            throw new Error(`Could not find fuzzy match for hunk (best similarity: ${bestMatch.score.toFixed(2)})`);
        }

        // Replace at best match location
        result = result.substring(0, bestMatch.index) + replacement + result.substring(bestMatch.index + bestMatch.length);
    }

    return result;
}

/**
 * Finds the best fuzzy match for a pattern in text.
 */
function findBestFuzzyMatch(text: string, pattern: string): { index: number; length: number; score: number } {
    const textLines = text.split('\n');
    const patternLines = pattern.split('\n');

    let bestIndex = -1;
    let bestScore = 0;
    let bestLength = 0;

    // Try to find the best matching window
    for (let i = 0; i <= textLines.length - patternLines.length; i++) {
        const window = textLines.slice(i, i + patternLines.length);
        const score = computeLineSimilarity(patternLines, window);

        if (score > bestScore) {
            bestScore = score;
            // Find character index of this line range
            const precedingLines = textLines.slice(0, i);
            bestIndex = precedingLines.join('\n').length + (precedingLines.length > 0 ? 1 : 0);
            bestLength = window.join('\n').length;
        }
    }

    return { index: bestIndex, length: bestLength, score: bestScore };
}

/**
 * Computes line-by-line similarity between two arrays of lines.
 */
function computeLineSimilarity(lines1: string[], lines2: string[]): number {
    if (lines1.length !== lines2.length) {
        return 0;
    }

    let matches = 0;
    for (let i = 0; i < lines1.length; i++) {
        // Normalize whitespace for comparison
        const l1 = lines1[i].trim();
        const l2 = lines2[i].trim();

        if (l1 === l2) {
            matches++;
        } else if (l1.length > 0 && l2.length > 0) {
            // Partial credit for similar lines
            const similarity = stringSimilarity(l1, l2);
            matches += similarity;
        }
    }

    return matches / lines1.length;
}

/**
 * Computes simple string similarity (0-1).
 */
function stringSimilarity(s1: string, s2: string): number {
    const len = Math.max(s1.length, s2.length);
    if (len === 0) return 1;

    let matches = 0;
    const minLen = Math.min(s1.length, s2.length);

    for (let i = 0; i < minLen; i++) {
        if (s1[i] === s2[i]) {
            matches++;
        }
    }

    return matches / len;
}


interface Hunk {
    expected: string;  // The "before" text (context + removed lines)
    replacement: string;  // The "after" text (context + added lines)
}

/**
 * Parses unified diff into hunks with before/after text.
 */
function parseUnifiedDiffHunks(diffContent: string): Hunk[] {
    const lines = diffContent.split('\n');
    const hunks: Hunk[] = [];
    let i = 0;

    // Skip headers (---, +++, etc.)
    while (i < lines.length && (lines[i].startsWith('---') || lines[i].startsWith('+++') || lines[i].trim() === '')) {
        i++;
    }

    while (i < lines.length) {
        const line = lines[i];

        // Look for hunk header (@@ -X,Y +A,B @@)
        if (line.startsWith('@@')) {
            i++;
            const expectedLines: string[] = [];
            const replacementLines: string[] = [];

            // Parse hunk body
            while (i < lines.length && !lines[i].startsWith('@@')) {
                const hunkLine = lines[i];

                if (hunkLine.startsWith('-')) {
                    // Removed line (only in expected)
                    expectedLines.push(hunkLine.substring(1));
                } else if (hunkLine.startsWith('+')) {
                    // Added line (only in replacement)
                    replacementLines.push(hunkLine.substring(1));
                } else if (hunkLine.startsWith(' ') || (!hunkLine.startsWith('-') && !hunkLine.startsWith('+'))) {
                    // Context line (in both)
                    const contextLine = hunkLine.startsWith(' ') ? hunkLine.substring(1) : hunkLine;
                    expectedLines.push(contextLine);
                    replacementLines.push(contextLine);
                }

                i++;
            }

            if (expectedLines.length > 0 || replacementLines.length > 0) {
                hunks.push({
                    expected: expectedLines.join('\n'),
                    replacement: replacementLines.join('\n'),
                });
            }
        } else {
            i++;
        }
    }

    return hunks;
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

