import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { isGitRepo, ensureGitRepo, getGitStatus } from '../../src/tools/git.js';
import { createLogger } from '../../src/core/logger.js';

describe('Git Tools', () => {
    const testRoot = path.resolve(process.cwd(), 'test-git-workspace');
    const logger = createLogger('git-test');

    beforeEach(async () => {
        await fs.mkdir(testRoot, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testRoot, { recursive: true, force: true });
    });

    describe('isGitRepo', () => {
        it('should return true for a valid git repo', async () => {
            // Initialize a repo
            await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                logger
            });

            const result = await isGitRepo(testRoot);
            expect(result).toBe(true);
        });

        it('should return false for a non-git directory', async () => {
            const result = await isGitRepo(testRoot);
            expect(result).toBe(false);
        });

        it('should return false for a missing directory', async () => {
            const nonexistent = path.join(testRoot, 'does-not-exist');
            const result = await isGitRepo(nonexistent);
            expect(result).toBe(false);
        });
    });

    describe('ensureGitRepo', () => {
        it('should return true for existing git repo', async () => {
            // Create repo first
            await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                logger
            });

            // Should detect existing repo
            const result = await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                logger
            });

            expect(result).toBe(true);
            expect(await isGitRepo(testRoot)).toBe(true);
        });

        it('should initialize repo when autoInit is true', async () => {
            const result = await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                logger
            });

            expect(result).toBe(true);
            expect(await isGitRepo(testRoot)).toBe(true);

            // Check that .git directory was created
            const gitDir = path.join(testRoot, '.git');
            const stat = await fs.stat(gitDir);
            expect(stat.isDirectory()).toBe(true);
        });

        it('should return false when autoInit is false and no repo exists', async () => {
            const result = await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: false,
                dryRun: false,
                logger
            });

            expect(result).toBe(false);
            expect(await isGitRepo(testRoot)).toBe(false);
        });

        it('should return false when git is disabled', async () => {
            const result = await ensureGitRepo(testRoot, {
                enabled: false,
                autoInit: true,
                dryRun: false,
                logger
            });

            expect(result).toBe(false);
            expect(await isGitRepo(testRoot)).toBe(false);
        });

        it('should return false in dry-run mode', async () => {
            const result = await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: true,
                logger
            });

            expect(result).toBe(false);
            expect(await isGitRepo(testRoot)).toBe(false);
        });

        it('should not reinitialize existing repo', async () => {
            // Initialize repo
            await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                logger
            });

            // Create a file to track if repo is modified
            const testFile = path.join(testRoot, 'test.txt');
            await fs.writeFile(testFile, 'test content');

            // Try to ensure repo again
            const result = await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                logger
            });

            expect(result).toBe(true);
            // File should still exist
            const content = await fs.readFile(testFile, 'utf-8');
            expect(content).toBe('test content');
        });
    });

    describe('getGitStatus', () => {
        it('should return clean status for empty repo', async () => {
            await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                logger
            });

            const status = await getGitStatus(testRoot);
            expect(status).not.toBeNull();
            expect(status?.clean).toBe(true);
            expect(status?.hasUntracked).toBe(false);
        });

        it('should detect untracked files', async () => {
            await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                logger
            });

            // Create an untracked file
            await fs.writeFile(path.join(testRoot, 'untracked.txt'), 'content');

            const status = await getGitStatus(testRoot);
            expect(status).not.toBeNull();
            expect(status?.clean).toBe(false);
            expect(status?.hasUntracked).toBe(true);
        });

        it('should return null for non-git directory', async () => {
            const status = await getGitStatus(testRoot);
            expect(status).toBeNull();
        });

        it('should return null for missing directory', async () => {
            const nonexistent = path.join(testRoot, 'does-not-exist');
            const status = await getGitStatus(nonexistent);
            expect(status).toBeNull();
        });
    });

    describe('git binary path', () => {
        it('should use custom git binary if provided', async () => {
            // This test verifies that custom binary path is passed through
            // We can't easily test with a fake binary, but we can verify the API accepts it
            const result = await ensureGitRepo(testRoot, {
                enabled: true,
                autoInit: true,
                dryRun: false,
                gitBinary: 'git', // Use default git
                logger
            });

            expect(result).toBe(true);
            expect(await isGitRepo(testRoot, 'git')).toBe(true);
        });
    });
});
