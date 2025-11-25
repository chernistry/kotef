import { AgentState } from '../state.js';

export interface DiagnosticsEntry {
    source: 'test' | 'build' | 'lint' | 'lsp' | 'runtime';
    file?: string;
    location?: { line: number; column?: number };
    message: string;
    firstSeenAt: number;
    lastSeenAt: number;
    occurrenceCount: number;
}

/**
 * Parses raw output from various tools into structured diagnostics.
 * Currently supports basic heuristic parsing for TypeScript/JS errors and test failures.
 */
export function parseDiagnostics(output: string, source: DiagnosticsEntry['source']): DiagnosticsEntry[] {
    const entries: DiagnosticsEntry[] = [];
    const lines = output.split('\n');
    const now = Date.now();

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Heuristic for TS errors: "file.ts(1,2): error TS1234: Message"
        // or "file.ts:1:2 - error TS1234: Message"
        // Improved regex to handle optional closing parenthesis/colon and various separators
        const tsErrorMatch = trimmed.match(/^(.+?)[(:](\d+)[,:](\d+)(?:[):]+)?\s+(?:-\s+)?(?:error|warning)\s+(?:TS\d+:\s+)?(.+)$/);
        if (tsErrorMatch) {
            entries.push({
                source: 'build', // TS errors are usually build/compile time
                file: tsErrorMatch[1],
                location: { line: parseInt(tsErrorMatch[2], 10), column: parseInt(tsErrorMatch[3], 10) },
                message: tsErrorMatch[4].trim(),
                firstSeenAt: now,
                lastSeenAt: now,
                occurrenceCount: 1,
            });
            continue;
        }

        // Heuristic for Test failures (e.g. "FAIL src/foo.test.ts")
        if (trimmed.startsWith('FAIL') && source === 'test') {
            const parts = trimmed.split(/\s+/);
            const file = parts[1]; // simplistic
            entries.push({
                source: 'test',
                file: file,
                message: trimmed,
                firstSeenAt: now,
                lastSeenAt: now,
                occurrenceCount: 1,
            });
            continue;
        }

        // Heuristic for Test suite failures (Jest style)
        // "● Test Suite Name › Test Case Name"
        if (trimmed.startsWith('●') && source === 'test') {
            entries.push({
                source: 'test',
                message: trimmed.substring(1).trim(),
                firstSeenAt: now,
                lastSeenAt: now,
                occurrenceCount: 1
            });
            continue;
        }
    }

    // If we couldn't parse anything specific but there is output and it's an error source, 
    // we might want to capture the whole block or the first few lines as a generic error.
    // For now, we return what we found.
    return entries;
}

/**
 * Merges new diagnostics into the existing log, updating counts and timestamps for duplicates.
 */
export function mergeDiagnostics(existing: DiagnosticsEntry[], newEntries: DiagnosticsEntry[]): DiagnosticsEntry[] {
    const merged = [...existing];

    for (const newEntry of newEntries) {
        const existingIndex = merged.findIndex(e =>
            e.source === newEntry.source &&
            e.file === newEntry.file &&
            e.message === newEntry.message &&
            e.location?.line === newEntry.location?.line
        );

        if (existingIndex !== -1) {
            merged[existingIndex] = {
                ...merged[existingIndex],
                lastSeenAt: newEntry.lastSeenAt,
                occurrenceCount: merged[existingIndex].occurrenceCount + 1,
            };
        } else {
            merged.push(newEntry);
        }
    }

    // Optional: Sort by lastSeenAt desc or occurrenceCount desc
    return merged.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/**
 * Summarizes the diagnostics log for prompt injection.
 */
export function summarizeDiagnostics(log: DiagnosticsEntry[] | undefined, maxEntries: number = 5): string {
    if (!log || log.length === 0) return "No active diagnostics.";

    // Filter for "active" diagnostics (seen recently? or just all?)
    // For now, take top N most recent/frequent.
    const topEntries = log.slice(0, maxEntries);

    let summary = `Top ${topEntries.length} Diagnostics:\n`;
    for (const entry of topEntries) {
        const loc = entry.file ? `${entry.file}${entry.location ? `:${entry.location.line}` : ''}` : 'Global';
        summary += `- [${entry.source.toUpperCase()}] ${loc}: ${entry.message} (x${entry.occurrenceCount})\n`;
    }

    if (log.length > maxEntries) {
        summary += `... and ${log.length - maxEntries} more.\n`;
    }

    return summary;
}

/**
 * Returns a single "primary" failure message to focus on.
 */
export function getPrimaryFailure(log: DiagnosticsEntry[] | undefined): string {
    if (!log || log.length === 0) return "";
    const top = log[0];
    const loc = top.file ? `${top.file}${top.location ? `:${top.location.line}` : ''}` : '';
    return `${top.source.toUpperCase()} error${loc ? ` in ${loc}` : ''}: ${top.message}`;
}
