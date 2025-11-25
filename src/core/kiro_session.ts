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
        // Execute kiro-cli in the project root
        const result = await execa(kiroPath, args, {
            cwd: options.rootDir,
            timeout,
            reject: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Snapshot directory after Kiro runs
        const after = await snapshotDirectory(options.rootDir);
        const changedFiles = await detectChanges(before, after);

        // Check for errors
        if (result.exitCode !== 0) {
            return {
                success: false,
                changedFiles: [],
                stdout: result.stdout,
                stderr: result.stderr,
                error: `Kiro session failed with exit code ${result.exitCode}`,
            };
        }

        return {
            success: true,
            changedFiles,
            stdout: result.stdout,
            stderr: result.stderr,
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
            // Return partial results on timeout
            const after = await snapshotDirectory(options.rootDir);
            const changedFiles = await detectChanges(before, after);

            return {
                success: false,
                changedFiles,
                stdout: (error as any).stdout || '',
                stderr: (error as any).stderr || '',
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
