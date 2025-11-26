import { runCommandSafe } from './command_runner.js';
import { Logger } from '../core/logger.js';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface GitOptions {
    enabled: boolean;
    autoInit: boolean;
    dryRun: boolean;
    gitBinary?: string;
    logger: Logger;
}

export interface GitStatus {
    clean: boolean;
    hasUntracked: boolean;
}

/**
 * Check if a directory is a git repository.
 * Checks for the existence of a .git directory directly using the filesystem.
 * This ensures we only detect repos initialized in this specific directory,
 * not parent repositories.
 * 
 * @param rootDir - Directory to check
 * @param gitBinary - Path to git binary (default: 'git') - not used in this check
 * @returns true if git repo, false otherwise (never throws)
 */
export async function isGitRepo(rootDir: string, gitBinary = 'git'): Promise<boolean> {
    try {
        const gitDir = path.join(rootDir, '.git');
        const stat = await fs.stat(gitDir);
        return stat.isDirectory();
    } catch (e) {
        return false;
    }
}

/**
 * Ensure a git repository exists in the target directory.
 * Will initialize if needed and allowed by options.
 * 
 * @param rootDir - Directory to ensure has a git repo
 * @param opts - Git options (enabled, autoInit, dryRun, logger)
 * @returns true if repo is available for use, false otherwise
 */
export async function ensureGitRepo(rootDir: string, opts: GitOptions): Promise<boolean> {
    const { enabled, autoInit, dryRun, gitBinary = 'git', logger } = opts;

    // Fast path: git disabled
    if (!enabled) {
        logger.info('Git integration disabled via config', { rootDir });
        return false;
    }

    // Fast path: dry-run mode
    if (dryRun) {
        logger.info('Dry-run mode: skipping git operations', { rootDir });
        return false;
    }

    // Check if repo already exists
    const repoExists = await isGitRepo(rootDir, gitBinary);
    if (repoExists) {
        logger.info('Git repository detected', { rootDir });
        return true;
    }

    // No repo exists
    if (!autoInit) {
        logger.warn('Git auto-init disabled and no repo found', { rootDir });
        return false;
    }

    // Initialize new repo
    logger.info('Initializing git repository', { rootDir });
    try {
        // Try to init with main branch (git 2.28+)
        let result = await runCommandSafe(`${gitBinary} init -b main`, {
            cwd: rootDir,
            timeoutMs: 10000
        });

        // Fallback to plain init if -b flag not supported
        if (result.exitCode !== 0 && result.stderr.includes('unknown option')) {
            logger.debug('Git init -b main not supported, falling back to plain init');
            result = await runCommandSafe(`${gitBinary} init`, {
                cwd: rootDir,
                timeoutMs: 10000
            });
        }

        if (result.exitCode === 0) {
            logger.info('Git repository initialized successfully', { rootDir });
            return true;
        } else {
            logger.warn('Git init failed', {
                rootDir,
                exitCode: result.exitCode,
                stderr: result.stderr
            });
            return false;
        }
    } catch (e: any) {
        logger.warn('Git init failed with exception', {
            rootDir,
            error: e.message
        });
        return false;
    }
}

/**
 * Get git status for a directory.
 * 
 * @param rootDir - Directory to check status for
 * @param gitBinary - Path to git binary (default: 'git')
 * @returns GitStatus object or null if git unavailable
 */
export async function getGitStatus(rootDir: string, gitBinary = 'git'): Promise<GitStatus | null> {
    // Only return status if this directory itself is a git repo
    // (not just inside a parent repo)
    const isRepo = await isGitRepo(rootDir, gitBinary);
    if (!isRepo) {
        return null;
    }

    try {
        const result = await runCommandSafe(`${gitBinary} status --porcelain`, {
            cwd: rootDir,
            timeoutMs: 10000
        });

        if (result.exitCode !== 0) {
            return null;
        }

        const output = result.stdout.trim();
        const clean = output.length === 0;
        const hasUntracked = output.split('\n').some(line => line.startsWith('??'));

        return { clean, hasUntracked };
    } catch (e) {
        return null;
    }
}
