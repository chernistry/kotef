
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHotspots } from '../../src/tools/git.js';
import * as commandRunner from '../../src/tools/command_runner.js';
import path from 'node:path';

describe('Git Hotspots', () => {
    it('should return empty list if not a git repo', async () => {
        // Mock isGitRepo to return false (indirectly via runCommandSafe or fs check)
        // Since isGitRepo uses fs.stat, we might need to mock fs or just rely on a non-existent dir
        const hotspots = await getHotspots('/non/existent/dir');
        expect(hotspots).toEqual([]);
    });

    it('should parse git log output correctly', async () => {
        const mockRunCommandSafe = vi.spyOn(commandRunner, 'runCommandSafe');

        // Mock isGitRepo check (first call to runCommandSafe or fs)
        // Actually isGitRepo uses fs.stat. For this test we can assume the test runs in a repo or mock fs.
        // But getHotspots calls isGitRepo. Let's mock runCommandSafe to handle the git log calls.

        // We need to bypass the isGitRepo check for this unit test if we don't want to rely on real FS.
        // However, getHotspots calls isGitRepo which calls fs.stat.
        // Let's assume we run this in the current project which IS a git repo.

        mockRunCommandSafe.mockImplementation(async (cmd) => {
            if (cmd.includes('log -n 500')) {
                return {
                    exitCode: 0,
                    stdout: `src/file1.ts
src/file1.ts
src/file2.ts
src/file1.ts
src/file3.ts
.sdd/ignored.md
node_modules/ignored.js
`,
                    stderr: ''
                };
            }
            if (cmd.includes('log -1')) {
                return {
                    exitCode: 0,
                    stdout: '2023-10-27',
                    stderr: ''
                };
            }
            return { exitCode: 1, stdout: '', stderr: '' };
        });

        // We pass process.cwd() so isGitRepo passes
        const hotspots = await getHotspots(process.cwd(), { limit: 3 });

        expect(hotspots.length).toBe(3);
        expect(hotspots[0].file).toBe('src/file1.ts');
        expect(hotspots[0].commits).toBe(3);
        expect(hotspots[0].lastCommitDate).toBe('2023-10-27');

        expect(hotspots[1].file).toBe('src/file2.ts');
        expect(hotspots[1].commits).toBe(1);

        expect(hotspots[2].file).toBe('src/file3.ts');
        expect(hotspots[2].commits).toBe(1);

        mockRunCommandSafe.mockRestore();
    });
});
