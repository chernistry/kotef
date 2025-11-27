import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDiagnostics } from '../../src/tools/diagnostics.js';
import * as commandRunner from '../../src/tools/command_runner.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// Mock runCommandSafe
vi.mock('../../src/tools/command_runner.js', () => ({
    runCommandSafe: vi.fn()
}));

// Mock fs
vi.mock('node:fs/promises', () => {
    const access = vi.fn();
    return {
        access,
        default: { access }
    };
});

// Mock ts_lsp_client
vi.mock('../../src/tools/ts_lsp_client.js', () => ({
    startServer: vi.fn(),
    stopServer: vi.fn(),
    getDiagnostics: vi.fn()
}));

describe('Multi-Language Diagnostics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createMockResult = (overrides: any) => ({
        command: overrides.command || 'test',
        args: [],
        exitCode: overrides.exitCode ?? 0,
        stdout: overrides.stdout || '',
        stderr: overrides.stderr || '',
        timedOut: overrides.timedOut || false,
        startTime: Date.now(),
        endTime: Date.now(),
        durationMs: 100
    });

    it('should run cargo check for Rust projects', async () => {
        // Mock Cargo.toml existence
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('Cargo.toml')) return undefined;
            throw new Error('ENOENT');
        });

        const mockCargoOutput = JSON.stringify({
            reason: 'compiler-message',
            message: {
                level: 'error',
                message: 'mismatched types',
                code: { code: 'E0308' },
                spans: [{
                    file_name: 'src/main.rs',
                    line_start: 10,
                    column_start: 5,
                    is_primary: true
                }]
            }
        });

        vi.mocked(commandRunner.runCommandSafe).mockResolvedValue(createMockResult({
            command: 'cargo check',
            stdout: mockCargoOutput
        }));

        const diagnostics = await runDiagnostics('/tmp/rust-project');

        expect(diagnostics.length).toBe(1);
        expect(diagnostics[0].file).toBe('src/main.rs');
        expect(diagnostics[0].severity).toBe('error');
        expect(diagnostics[0].code).toBe('E0308');
        expect(diagnostics[0].message).toBe('mismatched types');
    });

    it('should run go vet for Go projects', async () => {
        // Mock go.mod existence
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('go.mod')) return undefined;
            throw new Error('ENOENT');
        });

        const mockGoOutput = './main.go:10:2: fmt.Printf format %d has arg str of wrong type string';

        vi.mocked(commandRunner.runCommandSafe).mockResolvedValue(createMockResult({
            command: 'go vet',
            stderr: mockGoOutput // go vet uses stderr
        }));

        const diagnostics = await runDiagnostics('/tmp/go-project');

        expect(diagnostics.length).toBe(1);
        expect(diagnostics[0].file).toContain('main.go');
        expect(diagnostics[0].severity).toBe('error');
        expect(diagnostics[0].message).toContain('fmt.Printf format');
    });

    it('should run mypy for Python projects', async () => {
        // Mock requirements.txt existence
        vi.mocked(fs.access).mockImplementation(async (p) => {
            if (String(p).endsWith('requirements.txt')) return undefined;
            throw new Error('ENOENT');
        });

        const mockMypyOutput = 'src/main.py:10: error: Incompatible types in assignment';

        vi.mocked(commandRunner.runCommandSafe).mockResolvedValue(createMockResult({
            command: 'mypy',
            stdout: mockMypyOutput
        }));

        const diagnostics = await runDiagnostics('/tmp/python-project');

        expect(diagnostics.length).toBe(1);
        expect(diagnostics[0].file).toContain('src/main.py');
        expect(diagnostics[0].severity).toBe('error');
        expect(diagnostics[0].message).toBe('Incompatible types in assignment');
    });

    it('should return empty array if no supported project found', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const diagnostics = await runDiagnostics('/tmp/empty-project');
        expect(diagnostics).toEqual([]);
        expect(commandRunner.runCommandSafe).not.toHaveBeenCalled();
    });
});
