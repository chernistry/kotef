import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { KotefConfig } from '../core/config.js';

const execAsync = promisify(exec);

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

function classifyFailure(stdout: string, stderr: string, exitCode: number): { kind: FailureKind; summary: string } {
    const combined = (stdout + '\n' + stderr).toLowerCase();

    if (combined.includes('etimedout') || combined.includes('timed out')) {
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
 */
export async function runCommand(
    cfg: KotefConfig,
    command: string,
    timeoutMs: number = 30000
): Promise<TestRunResult> {
    // Security check: prevent obvious shell injection if command comes from untrusted source
    // For now, we assume the agent generates the command, but we should be careful.
    // Ideally, we'd use spawn with arguments array, but test commands are often complex strings.
    // We rely on the agent being trusted and the sandbox being the container.

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
        const { stdout, stderr } = await execAsync(command, {
            cwd: cfg.rootDir,
            timeout: timeoutMs,
            killSignal: 'SIGTERM',
        });

        return {
            command,
            exitCode: 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            passed: true
        };
    } catch (error: any) {
        // exec throws if exit code is non-zero
        const stdout = (error.stdout || '').trim();
        const stderr = (error.stderr || '').trim();
        const exitCode = error.code || 1;
        const { kind, summary } = classifyFailure(stdout, stderr, exitCode);

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
