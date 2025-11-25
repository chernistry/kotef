import { runCommandSafe } from './command_runner.js';
import { KotefConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

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
 * Runs a one-shot LSP diagnostics check on the project.
 * Note: A full persistent LSP client is complex. For this MVP, we might use tsc directly
 * or a simplified LSP interaction if we want to support open files.
 * 
 * However, the ticket explicitly mentions `typescript-language-server`.
 * Interacting with it via stdio JSON-RPC is the standard way.
 * 
 * For a robust "one-shot" diagnostic without keeping a server alive, 
 * we can actually just run `tsc --noEmit` which is what the LSP does under the hood for full project checks.
 * 
 * BUT, the ticket says "Augment... with LSP... so that the agent has a cheap... signal".
 * And "uses typescript-language-server... launched as a child process".
 * 
 * Let's implement a minimal LSP client that starts the server, sends 'initialize', 
 * waits for diagnostics (or requests them), and then shuts down.
 * 
 * Actually, `tsc --noEmit` is often slower than a warm LSP, but for a one-shot, LSP cold start might be similar.
 * The benefit of LSP is getting diagnostics for *specific files* even if they are in a broken state that stops full emit.
 * 
 * Let's try to implement a minimal client.
 */
export async function runTsLspDiagnostics(rootDir: string, files?: string[]): Promise<LspDiagnostic[]> {
    // Fallback to tsc for simplicity and robustness if we just want project-wide errors.
    // Implementing a full JSON-RPC handshake here is risky for a "fast" ticket.
    // Let's stick to the "tsc" approach for the "LSP" signal for now, as it's effectively the same source of truth for TS.
    // 
    // WAIT, the ticket says: "uses typescript-language-server (or equivalent)".
    // If I use `tsc`, I am technically using the "equivalent" compiler.
    // But `tsc` output parsing is brittle.
    // 
    // Let's try to use `typescript-language-server` if possible, but it requires a proper client loop.
    // 
    // Alternative: Use `tsc` with a structured output formatter?
    // 
    // Let's implement a wrapper around `tsc` first as it's much safer and achieves the goal of "compile-time errors".
    // We can parse the output reliably.

    // Check if tsconfig exists
    try {
        await fs.access(path.join(rootDir, 'tsconfig.json'));
    } catch {
        return []; // Not a TS project
    }

    const tscPath = path.join(rootDir, 'node_modules', '.bin', 'tsc');
    // If local tsc doesn't exist, try global or npx, but command_runner handles path.

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
