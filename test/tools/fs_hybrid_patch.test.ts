import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writePatch, readFile } from '../../src/tools/fs.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('FS Hybrid Patching (DMP Fallback)', () => {
    let tmpDir: string;
    let ctx: { rootDir: string };

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kotef-test-'));
        ctx = { rootDir: tmpDir };
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('should use strict diff when patch matches perfectly', async () => {
        const file = 'test.ts';
        const content = 'function hello() {\n  console.log("world");\n}\n';
        await fs.writeFile(path.join(tmpDir, file), content);

        const diff = `--- test.ts
+++ test.ts
@@ -1,3 +1,3 @@
 function hello() {
-  console.log("world");
+  console.log("universe");
 }
`;
        await writePatch(ctx, file, diff);
        const result = await readFile(ctx, file);
        expect(result).toBe('function hello() {\n  console.log("universe");\n}\n');
    });

    it('should fallback to DMP when context has minor drift (whitespace)', async () => {
        const file = 'drift.ts';
        // Original content has extra spaces/newlines compared to what patch expects
        const content = 'function hello() {\n\n  console.log("world");\n\n}\n';
        await fs.writeFile(path.join(tmpDir, file), content);

        // Patch expects tighter spacing
        const diff = `--- drift.ts
+++ drift.ts
@@ -1,3 +1,3 @@
 function hello() {
-  console.log("world");
+  console.log("universe");
 }
`;
        // Strict diff will fail because context doesn't match exactly
        await writePatch(ctx, file, diff);
        const result = await readFile(ctx, file);

        // DMP should find the line and replace it, preserving surrounding context
        expect(result).toBe('function hello() {\n\n  console.log("universe");\n\n}\n');
    });

    it('should fallback to DMP when context has comments added', async () => {
        const file = 'comments.ts';
        const content = 'function hello() {\n  // Some comment\n  console.log("world");\n}\n';
        await fs.writeFile(path.join(tmpDir, file), content);

        const diff = `--- comments.ts
+++ comments.ts
@@ -1,3 +1,3 @@
 function hello() {
-  console.log("world");
+  console.log("universe");
 }
`;
        await writePatch(ctx, file, diff);
        const result = await readFile(ctx, file);
        expect(result).toBe('function hello() {\n  // Some comment\n  console.log("universe");\n}\n');
    });

    it('should fail if DMP cannot find a match (ambiguous or missing)', async () => {
        const file = 'missing.ts';
        // Content is completely different
        const content = 'function hello() {\n  return true;\n}\n';
        await fs.writeFile(path.join(tmpDir, file), content);

        const diff = `--- missing.ts
+++ missing.ts
@@ -1,3 +1,3 @@
 function hello() {
-  console.log("world");
+  console.log("universe");
 }
`;
        await expect(writePatch(ctx, file, diff)).rejects.toThrow(/DMP patch application failed/);
    });

    it('should NOT use fuzzy fallback for non-code files', async () => {
        const file = 'data.txt';
        const content = 'line1\nline2\nline3\n';
        await fs.writeFile(path.join(tmpDir, file), content);

        // Patch with context mismatch that strict diff should definitely reject
        const diff = `--- data.txt
+++ data.txt
@@ -1,3 +1,3 @@
 line1
-line2
+line2-modified
 line3
`;
        // Modify file to break strict diff - change context lines
        await fs.writeFile(path.join(tmpDir, file), 'line1-changed\nline2\nline3-changed\n');

        await expect(writePatch(ctx, file, diff)).rejects.toThrow(/Fuzzy fallback not available/);
    });
});
