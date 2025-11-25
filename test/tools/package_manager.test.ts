import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, resolveScriptCommand, resolveExecCommand } from '../../src/tools/package_manager.js';
import * as detectPM from 'detect-package-manager';

// Mock detect-package-manager
vi.mock('detect-package-manager');

describe('Package Manager Detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should detect npm', async () => {
        vi.mocked(detectPM.detect).mockResolvedValue('npm');
        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('npm');
        expect(pm.installCommand).toBe('npm install');
        expect(resolveScriptCommand(pm, 'test')).toBe('npm run test');
        expect(resolveExecCommand(pm, 'tsc')).toBe('npx tsc');
    });

    it('should detect yarn', async () => {
        vi.mocked(detectPM.detect).mockResolvedValue('yarn');
        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('yarn');
        expect(pm.installCommand).toBe('yarn install');
        expect(resolveScriptCommand(pm, 'test')).toBe('yarn run test');
        expect(resolveExecCommand(pm, 'tsc')).toBe('yarn dlx tsc');
    });

    it('should detect pnpm', async () => {
        vi.mocked(detectPM.detect).mockResolvedValue('pnpm');
        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('pnpm');
        expect(pm.installCommand).toBe('pnpm install');
        expect(resolveScriptCommand(pm, 'test')).toBe('pnpm run test');
        expect(resolveExecCommand(pm, 'tsc')).toBe('pnpm dlx tsc');
    });

    it('should detect bun', async () => {
        vi.mocked(detectPM.detect).mockResolvedValue('bun');
        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('bun');
        expect(pm.installCommand).toBe('bun install');
        expect(resolveScriptCommand(pm, 'test')).toBe('bun run test');
        expect(resolveExecCommand(pm, 'tsc')).toBe('bunx tsc');
    });

    it('should fallback to npm on error', async () => {
        vi.mocked(detectPM.detect).mockRejectedValue(new Error('No lockfile'));
        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('npm');
    });
});
