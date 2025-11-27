import { runCommandSafe } from './command_runner.js';
import { startServer, stopServer, getDiagnostics, LspDiagnostic as LspClientDiagnostic } from './ts_lsp_client.js';
import { createLogger } from '../core/logger.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { detectPackageManager } from './package_manager.js';

const log = createLogger('diagnostics');

export interface LspDiagnostic {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    code?: string | number;
}

interface DiagnosticProvider {
    name: string;
    supports(rootDir: string): Promise<boolean>;
    run(rootDir: string, files?: string[]): Promise<LspDiagnostic[]>;
}

// --- Providers ---

const TscProvider: DiagnosticProvider = {
    name: 'tsc',
    async supports(rootDir: string) {
        try {
            await fs.access(path.join(rootDir, 'tsconfig.json'));
            return true;
        } catch {
            return false;
        }
    },
    async run(rootDir: string, files?: string[]) {
        // Try server first
        try {
            const handle = await startServer({ rootDir, timeout: 30000 });
            try {
                const diagnostics = await getDiagnostics(handle, files);
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
            log.warn('LSP server diagnostics failed, falling back to tsc CLI', { error });
            // Fallback to CLI
            const result = await runCommandSafe('tsc --noEmit --pretty false', { cwd: rootDir, timeoutMs: 60000 });
            return parseTscOutput(result.stdout + '\n' + result.stderr, rootDir);
        }
    }
};

const CargoCheckProvider: DiagnosticProvider = {
    name: 'cargo-check',
    async supports(rootDir: string) {
        try {
            await fs.access(path.join(rootDir, 'Cargo.toml'));
            return true;
        } catch {
            return false;
        }
    },
    async run(rootDir: string) {
        // cargo check --message-format=json
        const result = await runCommandSafe('cargo check --message-format=json', { cwd: rootDir, timeoutMs: 60000 });
        return parseCargoOutput(result.stdout, rootDir);
    }
};

const GoVetProvider: DiagnosticProvider = {
    name: 'go-vet',
    async supports(rootDir: string) {
        try {
            await fs.access(path.join(rootDir, 'go.mod'));
            return true;
        } catch {
            return false;
        }
    },
    async run(rootDir: string) {
        const result = await runCommandSafe('go vet ./...', { cwd: rootDir, timeoutMs: 60000 });
        return parseGoVetOutput(result.stderr, rootDir); // go vet writes to stderr
    }
};

const PythonMypyProvider: DiagnosticProvider = {
    name: 'mypy',
    async supports(rootDir: string) {
        // Check for python files
        // We could check for mypy config, but let's assume if it's a python project we might want to try mypy if installed
        // For now, check for requirements or pyproject
        try {
            await fs.access(path.join(rootDir, 'requirements.txt'));
            return true;
        } catch {
            try {
                await fs.access(path.join(rootDir, 'pyproject.toml'));
                return true;
            } catch {
                return false;
            }
        }
    },
    async run(rootDir: string) {
        // Check if mypy is available?
        // For now, just try running it.
        const result = await runCommandSafe('mypy . --no-error-summary --no-pretty', { cwd: rootDir, timeoutMs: 60000 });
        return parseMypyOutput(result.stdout, rootDir);
    }
};

// --- Parsers ---

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
                file: path.relative(rootDir, path.resolve(rootDir, file)),
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

function parseCargoOutput(output: string, rootDir: string): LspDiagnostic[] {
    const diagnostics: LspDiagnostic[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
        try {
            if (!line.trim()) continue;
            const json = JSON.parse(line);
            if (json.reason === 'compiler-message' && json.message) {
                const msg = json.message;
                if (msg.spans && msg.spans.length > 0) {
                    const primarySpan = msg.spans.find((s: any) => s.is_primary) || msg.spans[0];
                    diagnostics.push({
                        file: primarySpan.file_name,
                        line: primarySpan.line_start,
                        column: primarySpan.column_start,
                        severity: msg.level === 'error' ? 'error' : 'warning',
                        message: msg.message,
                        code: msg.code?.code
                    });
                }
            }
        } catch (e) {
            // Ignore non-json lines
        }
    }
    return diagnostics;
}

function parseGoVetOutput(output: string, rootDir: string): LspDiagnostic[] {
    const diagnostics: LspDiagnostic[] = [];
    const lines = output.split('\n');
    // Example: ./main.go:10:2: fmt.Printf format %d has arg str of wrong type string
    const regex = /^(.+?):(\d+):(\d+): (.+)$/;

    for (const line of lines) {
        const match = line.trim().match(regex);
        if (match) {
            const [_, file, lineStr, colStr, message] = match;
            diagnostics.push({
                file: path.relative(rootDir, path.resolve(rootDir, file)),
                line: parseInt(lineStr, 10),
                column: parseInt(colStr, 10),
                severity: 'error', // go vet usually reports issues
                message: message.trim()
            });
        }
    }
    return diagnostics;
}

function parseMypyOutput(output: string, rootDir: string): LspDiagnostic[] {
    const diagnostics: LspDiagnostic[] = [];
    const lines = output.split('\n');
    // Example: src/main.py:10: error: Incompatible types in assignment
    const regex = /^(.+?):(\d+): (error|warning|note): (.+)$/;

    for (const line of lines) {
        const match = line.trim().match(regex);
        if (match) {
            const [_, file, lineStr, severity, message] = match;
            diagnostics.push({
                file: path.relative(rootDir, path.resolve(rootDir, file)),
                line: parseInt(lineStr, 10),
                column: 0, // mypy doesn't always give column
                severity: severity === 'note' ? 'info' : (severity as 'error' | 'warning'),
                message: message.trim()
            });
        }
    }
    return diagnostics;
}

// --- Main Export ---

const PROVIDERS = [TscProvider, CargoCheckProvider, GoVetProvider, PythonMypyProvider];

/**
 * Runs diagnostics for the detected project type.
 */
export async function runDiagnostics(
    rootDir: string,
    files?: string[]
): Promise<LspDiagnostic[]> {
    const diagnostics: LspDiagnostic[] = [];

    for (const provider of PROVIDERS) {
        if (await provider.supports(rootDir)) {
            log.info(`Running diagnostics with ${provider.name}`);
            try {
                const results = await provider.run(rootDir, files);
                diagnostics.push(...results);
            } catch (e) {
                log.error(`Provider ${provider.name} failed`, { error: e });
            }
        }
    }

    return diagnostics;
}

// Backwards compatibility alias
export const runTsLspDiagnosticsViaServer = runDiagnostics;
export const runTsLspDiagnostics = runDiagnostics;
