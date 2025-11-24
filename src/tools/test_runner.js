import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
/**
 * Executes a shell command (e.g., test runner) within the project root.
 * Enforces a timeout to prevent hanging processes.
 */
export async function runCommand(cfg, command, timeoutMs = 30000) {
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
    }
    catch (error) {
        // exec throws if exit code is non-zero
        return {
            command,
            exitCode: error.code || 1,
            stdout: (error.stdout || '').trim(),
            stderr: (error.stderr || '').trim(),
            passed: false
        };
    }
}
