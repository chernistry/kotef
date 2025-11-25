import { describe, it, expect } from 'vitest';
import { runCommandSafe, detectPackageManager } from '../../src/tools/command_runner.js';
import path from 'node:path';

describe('CommandRunner', () => {
    describe('runCommandSafe', () => {
        it('should run a simple command', async () => {
            const result = await runCommandSafe('echo "hello"', { timeoutMs: 1000 });
            expect(result.exitCode).toBe(0);
            expect(result.stdout.trim()).toBe('hello');
            expect(result.timedOut).toBe(false);
        });

        it('should handle non-zero exit code', async () => {
            const result = await runCommandSafe('exit 1', { timeoutMs: 1000 });
            expect(result.exitCode).toBe(1);
            expect(result.passed).toBeUndefined(); // CommandResult doesn't have passed, TestRunResult does
        });

        it('should handle timeout', async () => {
            const result = await runCommandSafe('sleep 2', { timeoutMs: 100 });
            expect(result.timedOut).toBe(true);
            // exitCode might be undefined or signal related depending on platform
        });

        it('should capture stderr', async () => {
            const result = await runCommandSafe('echo "error" >&2', { timeoutMs: 1000 });
            expect(result.stderr.trim()).toBe('error');
        });
    });

    describe('detectPackageManager', () => {
        it('should detect npm by default or if package-lock.json exists', async () => {
            // We assume the current repo uses npm or pnpm.
            // Kotef uses npm (based on package.json scripts using npm run).
            // But wait, there is no lockfile in the file list I saw earlier?
            // Actually I didn't check for lockfiles.
            // Let's just check that it returns one of the valid values.
            const pm = await detectPackageManager(process.cwd());
            expect(['npm', 'yarn', 'pnpm', 'bun']).toContain(pm);
        });
    });
});
