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

export interface CommitResult {
    committed: boolean;
    hash?: string;
    reason?: string;
}

export interface CommitParams {
    enabled: boolean;
    dryRun: boolean;
    ticketId?: string;
    ticketTitle?: string;
    filesChanged: string[];
    gitBinary?: string;
    logger: Logger;
}

/**
 * Extract ticket title from ticket markdown content.
 * Looks for the first non-empty line starting with '#' and returns the cleaned title.
 * 
 * @param ticketContent - Full markdown content of the ticket
 * @returns Cleaned ticket title or undefined if not found
 */
export function extractTicketTitle(ticketContent: string): string | undefined {
    const lines = ticketContent.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
            // Strip leading # characters and whitespace
            return trimmed.replace(/^#+\s*/, '').trim();
        }
    }
    return undefined;
}

/**
 * Commit changes after a successful ticket run.
 * 
 * @param rootDir - Repository root directory
 * @param params - Commit parameters
 * @returns CommitResult with committed status, hash, and/or reason
 */
export async function commitTicketRun(rootDir: string, params: CommitParams): Promise<CommitResult> {
    const { enabled, dryRun, ticketId, ticketTitle, filesChanged, gitBinary = 'git', logger } = params;

    // Early exit: git disabled
    if (!enabled) {
        logger.info('Commit skipped: git disabled', { rootDir });
        return { committed: false, reason: 'git disabled' };
    }

    // Early exit: dry-run mode
    if (dryRun) {
        logger.info('Commit skipped: dry-run mode', { rootDir, filesChanged });
        return { committed: false, reason: 'dry-run mode' };
    }

    // Early exit: no changes
    if (!filesChanged || filesChanged.length === 0) {
        logger.info('Commit skipped: no changes', { rootDir });
        return { committed: false, reason: 'no changes' };
    }

    // Deduplicate and normalize file paths
    const uniqueFiles = Array.from(new Set(filesChanged));
    logger.info('Preparing to commit changes', { rootDir, fileCount: uniqueFiles.length });

    try {
        // Stage files
        // Try to add files individually first
        let addResult = await runCommandSafe(`${gitBinary} add ${uniqueFiles.map(f => `"${f}"`).join(' ')}`, {
            cwd: rootDir,
            timeoutMs: 30000
        });

        // Fallback to git add -A if individual adds fail
        if (addResult.exitCode !== 0) {
            logger.debug('Individual file add failed, falling back to git add -A');
            addResult = await runCommandSafe(`${gitBinary} add -A`, {
                cwd: rootDir,
                timeoutMs: 30000
            });

            if (addResult.exitCode !== 0) {
                logger.warn('Failed to stage changes', {
                    rootDir,
                    stderr: addResult.stderr
                });
                return {
                    committed: false,
                    reason: `git add failed: ${addResult.stderr.substring(0, 200)}`
                };
            }
        }

        // Build commit message
        const message = ticketId && ticketTitle
            ? `[kotef] Ticket ${ticketId}: ${ticketTitle}`
            : '[kotef] Automated changes (no ticket id)';

        // Create commit
        const commitResult = await runCommandSafe(`${gitBinary} commit -m "${message}"`, {
            cwd: rootDir,
            timeoutMs: 30000
        });

        if (commitResult.exitCode !== 0) {
            // Check for common errors
            const stderr = commitResult.stderr.toLowerCase();
            if (stderr.includes('nothing to commit') || stderr.includes('no changes added')) {
                logger.info('Commit skipped: no staged changes', { rootDir });
                return { committed: false, reason: 'no staged changes' };
            }
            if (stderr.includes('user.name') || stderr.includes('user.email')) {
                logger.warn('Commit failed: git identity not configured', {
                    rootDir,
                    stderr: commitResult.stderr
                });
                return {
                    committed: false,
                    reason: 'git identity not configured (set user.name and user.email)'
                };
            }

            logger.warn('Commit failed', {
                rootDir,
                exitCode: commitResult.exitCode,
                stderr: commitResult.stderr
            });
            return {
                committed: false,
                reason: `commit failed: ${commitResult.stderr.substring(0, 200)}`
            };
        }

        // Get commit hash
        const hashResult = await runCommandSafe(`${gitBinary} rev-parse HEAD`, {
            cwd: rootDir,
            timeoutMs: 5000
        });

        const hash = hashResult.exitCode === 0 ? hashResult.stdout.trim() : undefined;

        logger.info('Changes committed successfully', {
            rootDir,
            hash,
            message,
            fileCount: uniqueFiles.length
        });

        return {
            committed: true,
            hash
        };
    } catch (e: any) {
        logger.warn('Commit failed with exception', {
            rootDir,
            error: e.message
        });
        return {
            committed: false,
            reason: `exception: ${e.message}`
        };
    }
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
