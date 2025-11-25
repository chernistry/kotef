import { execa, Options as ExecaOptions } from 'execa';
import { detect } from 'detect-package-manager';
import { npmRunPathEnv } from 'npm-run-path';
import path from 'node:path';

export interface CommandResult {
    command: string;
    args: string[];
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    killed: boolean;
    startTime: number;
    endTime: number;
    durationMs: number;
}

export interface RunCommandOptions {
    cwd?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    input?: string;
}

/**
 * Detects the package manager used in the given directory.
 */
export async function detectPackageManager(cwd: string): Promise<'npm' | 'yarn' | 'pnpm' | 'bun'> {
    try {
        const pm = await detect({ cwd });
        return pm as 'npm' | 'yarn' | 'pnpm' | 'bun';
    } catch (e) {
        return 'npm'; // Default fallback
    }
}

/**
 * Runs a shell command with robust handling for timeouts, signals, and output capture.
 * Automatically sets up PATH to include node_modules/.bin.
 */
export async function runCommandSafe(
    command: string,
    options: RunCommandOptions = {}
): Promise<CommandResult> {
    const cwd = options.cwd || process.cwd();
    const timeout = options.timeoutMs || 60000; // Default 60s
    const startTime = Date.now();

    // Prepare environment with npm-run-path
    const env = npmRunPathEnv({
        cwd,
        env: options.env || process.env
    });

    try {
        // We use shell: true to support commands like "npm run test" or piped commands if needed.
        // However, for safety, we might want to avoid shell if possible.
        // But the agent often generates full command strings.
        const subprocess = execa(command, {
            cwd,
            env,
            timeout,
            shell: true,
            all: true, // Capture interleaved stdout/stderr if needed, but we separate them below
            reject: false, // Don't throw on non-zero exit code
            input: options.input
        });

        const result = await subprocess;
        const endTime = Date.now();

        return {
            command,
            args: result.command.split(' ').slice(1), // Rough approximation
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            timedOut: result.timedOut,
            killed: result.killed,
            startTime,
            endTime,
            durationMs: endTime - startTime
        };
    } catch (e: any) {
        // Should only happen on system errors (spawn failed), not non-zero exit codes
        const endTime = Date.now();
        return {
            command,
            args: [],
            exitCode: -1,
            stdout: '',
            stderr: e.message || String(e),
            timedOut: e.timedOut || false,
            killed: e.killed || false,
            startTime,
            endTime,
            durationMs: endTime - startTime
        };
    }
}
