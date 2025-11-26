import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCommands } from '../../src/agent/utils/verification.js';
import { KotefConfig } from '../../src/core/config.js';
import * as fs from 'node:fs/promises';
import { listFiles } from '../../src/tools/fs.js';

// Mock fs and listFiles
vi.mock('node:fs/promises');
vi.mock('../../src/tools/fs.js');
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

describe('Verification Policy - detectCommands', () => {
    const mockConfig: KotefConfig = {
        rootDir: '/mock/root',
        modelFast: 'mock-model',
        modelStrong: 'mock-model',
        maxTokensPerRun: 1000,
        dryRun: true
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should detect Node.js stack with npm test', async () => {
        // Mock package.json
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
            scripts: { test: 'jest' },
            dependencies: { react: '18.0.0' }
        }));
        // Mock file checks
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT')); // No other files
        vi.mocked(listFiles).mockResolvedValue([]); // No python files

        const result = await detectCommands(mockConfig);
        expect(result.stack).toBe('node');
        expect(result.primaryTest).toBe('npm run test');
        expect(result.smokeTest).toBeUndefined();
    });

    it('should detect Vite frontend stack', async () => {
        // Mock package.json
        vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
            scripts: { dev: 'vite', build: 'vite build' },
            devDependencies: { vite: '5.0.0' }
        }));
        vi.mocked(listFiles).mockResolvedValue([]); // No python files

        const result = await detectCommands(mockConfig);
        expect(result.stack).toBe('vite_frontend');
        expect(result.smokeTest).toBe('npm run dev');
        expect(result.buildCommand).toBe('npm run build');
    });

    it('should detect Python stack with pytest', async () => {
        // Fail package.json read
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

        // Mock pyproject.toml existence
        vi.mocked(fs.access).mockImplementation(async (path) => {
            if (String(path).endsWith('pyproject.toml')) return undefined;
            throw new Error('ENOENT');
        });

        // Mock listFiles for python files
        vi.mocked(listFiles).mockResolvedValue(['src/main.py', 'tests/test_main.py']);

        const result = await detectCommands(mockConfig);
        expect(result.stack).toBe('python');
        expect(result.primaryTest).toBe('pytest');
    });

    it('should detect Python stack with app.py smoke test', async () => {
        // Fail package.json read
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

        // Mock requirements.txt existence
        vi.mocked(fs.access).mockImplementation(async (path) => {
            if (String(path).endsWith('requirements.txt')) return undefined;
            throw new Error('ENOENT');
        });

        // Mock listFiles for python files including app.py
        vi.mocked(listFiles).mockResolvedValue(['app.py']);

        const result = await detectCommands(mockConfig);
        expect(result.stack).toBe('python');
        expect(result.smokeTest).toBe('python app.py');
    });

    it('should return unknown for empty directory', async () => {
        vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(listFiles).mockResolvedValue([]);

        const result = await detectCommands(mockConfig);
        expect(result.stack).toBe('unknown');
    });
});
