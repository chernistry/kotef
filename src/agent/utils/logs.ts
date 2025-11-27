
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface LogErrorEntry {
    source: 'service_log' | 'project_log';
    file: string;
    message: string;
    timestamp?: number;
}

export interface ScanLogsOptions {
    logPaths: string[];
    sinceMs?: number;
    maxBytes?: number; // Default 64KB
}

/**
 * Scans the tail of specified log files for error patterns.
 */
export async function scanLogsForErrors(
    rootDir: string,
    options: ScanLogsOptions
): Promise<LogErrorEntry[]> {
    const results: LogErrorEntry[] = [];
    const maxBytes = options.maxBytes || 64 * 1024; // 64KB default
    const sinceMs = options.sinceMs || 0;

    // Common error patterns
    const errorPatterns = [
        /ERROR/i,
        /Exception/i,
        /Traceback/i,
        /Panic/i,
        /Fatal/i,
        // Project specific patterns can be added here or passed in options later
        /handlers\..* - ERROR -/
    ];

    for (const logPath of options.logPaths) {
        const fullPath = path.resolve(rootDir, logPath);
        try {
            const stats = await fs.stat(fullPath);
            if (!stats.isFile()) continue;

            // Read tail
            const start = Math.max(0, stats.size - maxBytes);
            const handle = await fs.open(fullPath, 'r');
            const buffer = Buffer.alloc(Math.min(stats.size, maxBytes));
            await handle.read(buffer, 0, buffer.length, start);
            await handle.close();

            const content = buffer.toString('utf-8');
            const lines = content.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;

                // Check patterns
                const isError = errorPatterns.some(p => p.test(line));
                if (isError) {
                    // TODO: Try to extract timestamp from line if possible
                    // For now, we assume if it's in the tail and we have a sinceMs,
                    // we might need better timestamp parsing.
                    // But if sinceMs is very recent (start of verification),
                    // and the log file hasn't rotated, this simple tail check is a decent heuristic.
                    // To be safer, we could check file mtime, but that's for the whole file.

                    // If the file was modified BEFORE sinceMs, we can skip it entirely (optimization)
                    if (stats.mtimeMs < sinceMs) {
                        break; // The whole file is too old
                    }

                    results.push({
                        source: 'service_log',
                        file: logPath,
                        message: line.trim(),
                        timestamp: stats.mtimeMs // Fallback to file mtime
                    });
                }
            }

        } catch (e) {
            // Ignore missing files or read errors
        }
    }

    return results;
}
