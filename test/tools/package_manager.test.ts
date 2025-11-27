import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectPackageManager, resolveScriptCommand, resolveExecCommand } from '../../src/tools/package_manager.js';
import * as detectPM from 'detect-package-manager';
import fs from 'node:fs/promises';
import path from 'node:path';

// Mock detect-package-manager
vi.mock('detect-package-manager');
// Mock fs.access
vi.mock('node:fs/promises');

describe('Package Manager Detection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should detect npm (default fallback)', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
        vi.mocked(detectPM.detect).mockResolvedValue('npm');

        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('npm');
        expect(pm.installCommand).toBe('npm install');
    });

    it('should detect python (poetry)', async () => {
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('poetry.lock')) return undefined;
            throw new Error('ENOENT');
        });

        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('poetry');
        expect(pm.installCommand).toBe('poetry install');
        expect(resolveScriptCommand(pm, 'test')).toBe('poetry run test');
    });

    it('should detect python (pip)', async () => {
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('requirements.txt')) return undefined;
            throw new Error('ENOENT');
        });

        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('pip');
        expect(pm.installCommand).toBe('pip install -r requirements.txt');
        expect(resolveExecCommand(pm, 'pytest')).toBe('python -m pytest');
    });

    it('should detect go', async () => {
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('go.mod')) return undefined;
            throw new Error('ENOENT');
        });

        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('go');
        expect(pm.installCommand).toBe('go mod download');
        expect(resolveScriptCommand(pm, 'main.go')).toBe('go run main.go');
    });

    it('should detect rust (cargo)', async () => {
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('Cargo.toml')) return undefined;
            throw new Error('ENOENT');
        });

        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('cargo');
        expect(pm.installCommand).toBe('cargo build');
        expect(resolveScriptCommand(pm, 'app')).toBe('cargo run --bin app');
    });

    it('should detect java (maven)', async () => {
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('pom.xml')) return undefined;
            throw new Error('ENOENT');
        });

        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('maven');
        expect(pm.installCommand).toBe('mvn install');
    });

    it('should detect java (gradle)', async () => {
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('build.gradle')) return undefined;
            throw new Error('ENOENT');
        });

        const pm = await detectPackageManager('/tmp');
        expect(pm.name).toBe('gradle');
        expect(pm.installCommand).toBe('gradle build');
    });
});
