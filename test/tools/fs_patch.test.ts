import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writePatch, applyEdits } from '../../src/tools/fs.js';
import { promises as fs } from 'node:fs';
import * as Diff from 'diff';

// Mock fs and Diff
vi.mock('node:fs', () => ({
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
    }
}));

vi.mock('diff', () => ({
    applyPatch: vi.fn(),
}));

describe('FS Tools Hardening', () => {

    describe('writePatch', () => {
        const mockFilePath = 'test.ts';

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should reject markdown fences', async () => {
            const malformedDiff = '```diff\n@@ -1,1 +1,1 @@\n-foo\n+bar\n```';
            await expect(writePatch(mockFilePath, malformedDiff)).rejects.toThrow('markdown fences');
        });

        it('should reject tool_call tags', async () => {
            const malformedDiff = '<tool_call>write_patch</tool_call>\n@@ -1,1 +1,1 @@\n-foo\n+bar';
            await expect(writePatch(mockFilePath, malformedDiff)).rejects.toThrow('tool_call tags');
        });

        it('should reject content without hunk headers or +/- lines', async () => {
            const invalidDiff = 'Just some text that is not a diff';
            await expect(writePatch(mockFilePath, invalidDiff)).rejects.toThrow('does not look like a unified diff');
        });

        it('should accept valid diff', async () => {
            const validDiff = '@@ -1,1 +1,1 @@\n-foo\n+bar';
            vi.mocked(fs.readFile).mockResolvedValue('foo');
            vi.mocked(Diff.applyPatch).mockReturnValue('bar');

            await writePatch(mockFilePath, validDiff);

            expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining(mockFilePath), 'utf-8');
            expect(Diff.applyPatch).toHaveBeenCalledWith('foo', validDiff);
            expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining(mockFilePath), 'bar', 'utf-8');
        });
    });

    describe('applyEdits', () => {
        const mockFilePath = 'test.ts';
        const initialContent = 'Hello World';

        beforeEach(() => {
            vi.clearAllMocks();
            vi.mocked(fs.readFile).mockResolvedValue(initialContent);
        });

        it('should apply simple replacement', async () => {
            const edits = [{
                range: { start: 6, end: 11 },
                newText: 'Kotef'
            }];

            await applyEdits(mockFilePath, edits);

            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining(mockFilePath),
                'Hello Kotef',
                'utf-8'
            );
        });

        it('should handle multiple edits (reverse order application)', async () => {
            // Edits: Replace "Hello" with "Hi", Replace "World" with "Earth"
            const edits = [
                { range: { start: 0, end: 5 }, newText: 'Hi' },
                { range: { start: 6, end: 11 }, newText: 'Earth' }
            ];

            await applyEdits(mockFilePath, edits);

            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining(mockFilePath),
                'Hi Earth',
                'utf-8'
            );
        });

        it('should throw on invalid ranges', async () => {
            const edits = [{
                range: { start: 100, end: 105 }, // Out of bounds
                newText: 'Fail'
            }];

            await expect(applyEdits(mockFilePath, edits)).rejects.toThrow('Invalid edit range');
        });
    });
});
