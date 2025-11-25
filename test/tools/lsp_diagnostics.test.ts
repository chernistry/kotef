import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTsLspDiagnostics } from '../../src/tools/lsp.js';
import * as commandRunner from '../../src/tools/command_runner.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// Mock runCommandSafe
vi.mock('../../src/tools/command_runner.js', () => ({
    runCommandSafe: vi.fn()
}));

// Mock fs
vi.mock('node:fs/promises', () => ({
    default: {
        access: vi.fn()
    }
}));

describe('LSP Diagnostics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should parse tsc output correctly', async () => {
        const mockOutput = `
src/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/bar.ts(20,1): warning TS1234: Something suspicious.
        `;

        vi.mocked(commandRunner.runCommandSafe).mockResolvedValue({
            command: 'tsc',
            args: [],
            exitCode: 1,
            stdout: mockOutput,
            stderr: '',
            timedOut: false,
            killed: false,
            startTime: 0,
            endTime: 0,
            durationMs: 0
        });

        vi.mocked(fs.access).mockResolvedValue(undefined); // tsconfig exists

        const diagnostics = await runTsLspDiagnostics('/tmp/project');

        expect(diagnostics.length).toBe(2);

        expect(diagnostics[0].file).toBe('src/foo.ts');
        expect(diagnostics[0].line).toBe(10);
        expect(diagnostics[0].column).toBe(5);
        expect(diagnostics[0].severity).toBe('error');
        expect(diagnostics[0].code).toBe('TS2322');
        expect(diagnostics[0].message).toBe("Type 'string' is not assignable to type 'number'.");

        expect(diagnostics[1].file).toBe('src/bar.ts');
        expect(diagnostics[1].severity).toBe('warning');
    });

    it('should return empty array if no tsconfig', async () => {
        vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

        const diagnostics = await runTsLspDiagnostics('/tmp/project');
        expect(diagnostics).toEqual([]);
        expect(commandRunner.runCommandSafe).not.toHaveBeenCalled();
    });
});
