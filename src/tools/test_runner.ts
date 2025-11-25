import { execa } from 'execa';
import { npmRunPathEnv } from 'npm-run-path';
import { KotefConfig } from '../core/config.js';

export type FailureKind = 'compilation' | 'test_failure' | 'timeout' | 'runtime_error' | 'unknown';

export interface TestRunResult {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    passed: boolean;
    failureKind?: FailureKind;
    failureSummary?: string;
}

function classifyFailure(stdout: string, stderr: string, exitCode: number, timedOut: boolean): { kind: FailureKind; summary: string } {
    const combined = (stdout + '\n' + stderr).toLowerCase();

    if (timedOut || combined.includes('etimedout') || combined.includes('timed out')) {
        return { kind: 'timeout', summary: 'Process timed out.' };
    }

    if (combined.includes('typescript error') || combined.includes('ts2') || combined.includes('syntaxerror')) {
        return { kind: 'compilation', summary: 'Compilation or syntax error detected.' };
    }

    if (combined.includes('failed') && combined.includes('test')) {
        return { kind: 'test_failure', summary: 'One or more tests failed.' };
    }

    if (exitCode !== 0) {
        return { kind: 'runtime_error', summary: `Process exited with code ${exitCode}.` };
    }

    return { kind: 'unknown', summary: 'Unknown failure.' };
}

/**
 * Executes a shell command (e.g., test runner) within the project root.
 * Enforces a timeout to prevent hanging processes.
 * Uses execa for better process control and npm-run-path for local binaries.
 */
export async function runCommand(
    cfg: KotefConfig,
    command: string,
    timeoutMs: number = 30000
): Promise<TestRunResult> {
    if (cfg.mockMode) {
        return {
            command,
            exitCode: 0,
            stdout: 'Mock test passed',
            stderr: '',
            passed: true
        };
    }

    try {
        const result = await execa(command, {
            cwd: cfg.rootDir,
            timeout: timeoutMs,
            shell: true,
            reject: false, // Don't throw on non-zero exit code
            env: npmRunPathEnv({ cwd: cfg.rootDir }),
            all: true // Capture interleaved output if needed, but we use stdout/stderr separately
        });

        if (result.timedOut) {
            const { kind, summary } = classifyFailure(result.stdout, result.stderr, result.exitCode, true);
            return {
                command,
                exitCode: result.exitCode,
                stdout: result.stdout.trim(),
                stderr: result.stderr.trim(),
                passed: false,
                failureKind: kind,
                failureSummary: summary
            };
        }

        if (result.exitCode === 0) {
            return {
                command,
                exitCode: 0,
                stdout: result.stdout.trim(),
                stderr: result.stderr.trim(),
                passed: true
            };
        } else {
            const { kind, summary } = classifyFailure(result.stdout, result.stderr, result.exitCode, false);
            return {
                command,
                exitCode: result.exitCode,
                stdout: result.stdout.trim(),
                stderr: result.stderr.trim(),
                passed: false,
                failureKind: kind,
                failureSummary: summary
            };
        }
    } catch (error: any) {
        // execa throws on timeout even with reject: false in some versions, or returns result with timedOut
        const isTimeout = error.timedOut || error.isCanceled || error.signal === 'SIGTERM';
        const stdout = (error.stdout || '').trim();
        const stderr = (error.stderr || '').trim();
        const exitCode = error.exitCode || 1;

        const { kind, summary } = classifyFailure(stdout, stderr, exitCode, isTimeout);

        return {
            command,
            exitCode,
            stdout,
            stderr,
            passed: false,
            failureKind: kind,
            failureSummary: summary
        };
    }
}
