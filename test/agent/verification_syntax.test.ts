import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCommands } from '../../src/agent/utils/verification.js';
import { listFiles } from '../../src/tools/fs.js';
import fs from 'node:fs/promises';

vi.mock('../../src/tools/fs.js', () => ({
    listFiles: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
    default: {
        readFile: vi.fn(),
        access: vi.fn()
    }
}));

vi.mock('../../src/tools/package_manager.js', () => ({
    detectPackageManager: vi.fn().mockResolvedValue({
        name: 'npm',
        installCommand: 'npm install',
        runCommand: (script: string) => `npm run ${script}`,
        execCommand: (command: string) => `npx ${command}`
    }),
    resolveScriptCommand: vi.fn((pm, script) => `npm run ${script}`),
    resolveExecCommand: vi.fn((pm, command) => `npx ${command}`)
}));

describe('Syntax Command Detection', () => {
    const mockConfig = { rootDir: '/test' } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should detect npm run lint for Node projects with lint script', async () => {
        vi.mocked(listFiles).mockResolvedValue(['package.json']);
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
            scripts: { lint: 'eslint .' }
        }));
        // Mock access to succeed for package.json
        vi.mocked(fs.access).mockResolvedValue(undefined);

        const cmds = await detectCommands(mockConfig);
        expect(cmds.syntaxCheckCommand).toBe('npm run lint');
    });

    it('should detect tsc --noEmit for TS projects without lint script', async () => {
        vi.mocked(listFiles).mockResolvedValue(['package.json', 'tsconfig.json']);
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
            scripts: { test: 'jest' }
        }));
        vi.mocked(fs.access).mockResolvedValue(undefined);

        const cmds = await detectCommands(mockConfig);
        expect(cmds.syntaxCheckCommand).toBe('npx tsc --noEmit');
    });

    it('should detect python compileall for Python projects', async () => {
        // Ensure package.json read fails so it falls through to Python check
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

        // For python, it checks for pyproject.toml, requirements.txt, or *.py files
        // Let's simulate just *.py files found via listFiles
        vi.mocked(listFiles).mockResolvedValue(['main.py']);
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT')); // no pyproject/requirements

        const cmds = await detectCommands(mockConfig);
        expect(cmds.syntaxCheckCommand).toContain('python3 -m compileall');
    });

    it('should return undefined for unknown stacks', async () => {
        // Ensure package.json read fails
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

        // Ensure listFiles returns empty (no py files)
        vi.mocked(listFiles).mockResolvedValue([]);
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const cmds = await detectCommands(mockConfig);
        expect(cmds.syntaxCheckCommand).toBeUndefined();
    });
});
