import { execa } from 'execa';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { KotefConfig } from './config.js';
import { KotefLlmError } from './llm.js';

export interface KiroSessionOptions {
    rootDir: string;
    prompt: string;
    timeout?: number;
    trustAllTools?: boolean;
    model?: string;
}

export interface KiroSessionResult {
    success: boolean;
    changedFiles: string[];
    stdout: string;
    stderr: string;
    error?: string;
}

interface FileSnapshot {
    path: string;
    hash: string;
}

/**
 * Run Kiro CLI in agent mode for autonomous coding tasks.
 */
export async function runKiroAgentSession(
    config: KotefConfig,
    options: KiroSessionOptions
): Promise<KiroSessionResult> {
    const kiroPath = config.kiroCliPath || 'kiro-cli';
    const timeout = options.timeout || config.kiroSessionTimeout;

    // Snapshot directory before Kiro runs
    const before = await snapshotDirectory(options.rootDir);

    // Build kiro-cli command
    const args = [
        'chat',
        '--no-interactive',
    ];

    // Add model if specified
    if (options.model || config.kiroModel) {
        args.push('--model', options.model || config.kiroModel);
    }

    // Add tool trust settings
    if (options.trustAllTools) {
        args.push('--trust-all-tools');
    }

    // Add the prompt as the last argument
    args.push(options.prompt);

    try {
        const log = (await import('./logger.js')).createLogger('kiro-session');

        log.info('Starting Kiro CLI session', {
            kiroPath,
            model: options.model || config.kiroModel,
            timeout,
            trustAllTools: options.trustAllTools,
            rootDir: options.rootDir,
        });

        // Log the prompt being sent (first 500 chars)
        log.info('Kiro prompt', {
            promptPreview: options.prompt.substring(0, 500) + (options.prompt.length > 500 ? '...' : '')
        });

        console.log('\n🤖 Kiro CLI is now working on the task...');
        console.log('📝 Command:', kiroPath, args.join(' '));
        console.log('📂 Working directory:', options.rootDir);
        console.log('⏱️  Timeout:', `${timeout}ms (${Math.round(timeout / 1000 / 60)} minutes)`);
        console.log('─'.repeat(80));

        // Execute kiro-cli in the project root with real-time output
        const result = await execa(kiroPath, args, {
            cwd: options.rootDir,
            timeout,
            reject: false,
            // Use 'inherit' to stream output in real-time for better debugging
            stdio: ['ignore', 'inherit', 'inherit'],
        });

        console.log('─'.repeat(80));
        log.info('Kiro CLI session completed', {
            exitCode: result.exitCode,
            timedOut: result.timedOut,
        });

        // Snapshot directory after Kiro runs
        const after = await snapshotDirectory(options.rootDir);
        const changedFiles = await detectChanges(before, after);

        log.info('File changes detected', {
            changedFiles: changedFiles.length,
            files: changedFiles,
        });

        // Check for errors
        if (result.exitCode !== 0) {
            log.error('Kiro session failed', {
                exitCode: result.exitCode,
                timedOut: result.timedOut,
            });

            return {
                success: false,
                changedFiles,
                stdout: '',
                stderr: '',
                error: `Kiro session failed with exit code ${result.exitCode}`,
            };
        }

        console.log(`✅ Kiro session completed successfully! Modified ${changedFiles.length} file(s).`);

        return {
            success: true,
            changedFiles,
            stdout: '',
            stderr: '',
        };

    } catch (error) {
        // Handle specific error cases
        if ((error as any).code === 'ENOENT') {
            throw new KotefLlmError(
                `kiro-cli not found at path: ${kiroPath}\n\n` +
                `To use Kiro coder mode:\n` +
                `  1. Install kiro-cli\n` +
                `  2. Set KIRO_CLI_PATH=/path/to/kiro-cli\n\n` +
                `Or switch back to internal coder:\n` +
                `  KOTEF_CODER_MODE=internal`,
                error
            );
        }

        if ((error as any).timedOut) {
            const log = (await import('./logger.js')).createLogger('kiro-session');
            log.warn('Kiro session timed out', { timeout });

            // Return partial results on timeout
            const after = await snapshotDirectory(options.rootDir);
            const changedFiles = await detectChanges(before, after);

            console.log(`⚠️  Kiro session timed out after ${timeout}ms. Detected ${changedFiles.length} file changes.`);

            return {
                success: false,
                changedFiles,
                stdout: '',
                stderr: '',
                error: `Kiro session timed out after ${timeout}ms`,
            };
        }

        return {
            success: false,
            changedFiles: [],
            stdout: '',
            stderr: '',
            error: `Kiro session failed: ${(error as Error).message}`,
        };
    }
}

/**
 * Create a snapshot of all files in a directory with their hashes.
 */
async function snapshotDirectory(rootDir: string): Promise<FileSnapshot[]> {
    const snapshots: FileSnapshot[] = [];

    async function walk(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(rootDir, fullPath);

            // Skip node_modules, .git, and other common ignored dirs
            if (relativePath.includes('node_modules') ||
                relativePath.includes('.git') ||
                relativePath.startsWith('.sdd/')) {
                continue;
            }

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile()) {
                try {
                    const content = await fs.readFile(fullPath);
                    const hash = createHash('sha256').update(content).digest('hex');
                    snapshots.push({ path: relativePath, hash });
                } catch {
                    // Ignore files we can't read
                }
            }
        }
    }

    await walk(rootDir);
    return snapshots;
}

/**
 * Detect changed files between two snapshots.
 */
async function detectChanges(
    before: FileSnapshot[],
    after: FileSnapshot[]
): Promise<string[]> {
    const beforeMap = new Map(before.map(s => [s.path, s.hash]));
    const afterMap = new Map(after.map(s => [s.path, s.hash]));
    const changed: string[] = [];

    // Check for modified or new files
    for (const [path, hash] of afterMap) {
        const beforeHash = beforeMap.get(path);
        if (!beforeHash || beforeHash !== hash) {
            changed.push(path);
        }
    }

    // Check for deleted files (also count as changes)
    for (const path of beforeMap.keys()) {
        if (!afterMap.has(path)) {
            changed.push(path);
        }
    }

    return changed;
}
