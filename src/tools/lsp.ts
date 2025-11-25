import { runCommandSafe } from './command_runner.js';
import { startServer, stopServer, getDiagnostics, LspDiagnostic as LspClientDiagnostic } from './ts_lsp_client.js';
import { createLogger } from '../core/logger.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const log = createLogger('lsp');

export interface LspDiagnostic {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    code?: string | number;
}

/**
 * Runs LSP diagnostics using the full TypeScript Language Server (JSON-RPC).
 * This is the preferred method as it provides file-level diagnostics and better error resolution.
 */
export async function runTsLspDiagnosticsViaServer(
    rootDir: string,
    files?: string[]
): Promise<LspDiagnostic[]> {
    try {
        const handle = await startServer({ rootDir, timeout: 30000 });
        try {
            const diagnostics = await getDiagnostics(handle, files);
            // Filter to only error/warning/info (exclude hint)
            return diagnostics
                .filter(d => d.severity !== 'hint')
                .map(d => ({
                    file: d.file,
                    line: d.line,
                    column: d.column,
                    severity: d.severity as 'error' | 'warning' | 'info',
                    message: d.message,
                    code: d.code
                }));
        } finally {
            await stopServer(handle);
        }
    } catch (error) {
        log.error('LSP server diagnostics failed', { error });
        // Fallback to tsc
        return runTsLspDiagnostics(rootDir, files);
    }
}

/**
 * Runs LSP diagnostics using tsc (fallback method).
 * This is faster to start but only provides project-wide diagnostics.
 */
export async function runTsLspDiagnostics(rootDir: string, files?: string[]): Promise<LspDiagnostic[]> {
    // Check if tsconfig exists
    try {
        await fs.access(path.join(rootDir, 'tsconfig.json'));
    } catch {
        return []; // Not a TS project
    }

    const result = await runCommandSafe('tsc --noEmit --pretty false', { cwd: rootDir, timeoutMs: 60000 });

    return parseTscOutput(result.stdout + '\n' + result.stderr, rootDir);
}

function parseTscOutput(output: string, rootDir: string): LspDiagnostic[] {
    const diagnostics: LspDiagnostic[] = [];
    const lines = output.split('\n');

    // Example: src/agent/nodes/verifier.ts(114,13): error TS2339: Property 'diagnosticsLog' does not exist on type 'AgentState'.
    const regex = /^(.+?)\((\d+),(\d+)\): (error|warning|info) (TS\d+): (.+)$/;

    for (const line of lines) {
        const match = line.trim().match(regex);
        if (match) {
            const [_, file, lineStr, colStr, severity, code, message] = match;
            diagnostics.push({
                file: path.relative(rootDir, path.resolve(rootDir, file)), // Ensure relative path
                line: parseInt(lineStr, 10),
                column: parseInt(colStr, 10),
                severity: severity as 'error' | 'warning' | 'info',
                code,
                message: message.trim()
            });
        }
    }

    return diagnostics;
}
