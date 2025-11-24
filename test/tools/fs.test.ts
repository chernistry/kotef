import { describe, it, beforeEach, afterEach, assert } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { resolvePath, readFile, listFiles, writePatch, FsContext } from '../../src/tools/fs.js';

describe('FS Tools', () => {
    const testRoot = path.resolve(process.cwd(), 'test-workspace');
    const ctx: FsContext = { rootDir: testRoot };

    beforeEach(async () => {
        await fs.mkdir(testRoot, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testRoot, { recursive: true, force: true });
    });

    describe('resolvePath', () => {
        it('should resolve valid relative paths', () => {
            const p = resolvePath(ctx, 'foo/bar.txt');
            assert.strictEqual(p, path.join(testRoot, 'foo/bar.txt'));
        });

        it('should throw on path traversal', () => {
            assert.throws(() => resolvePath(ctx, '../outside.txt'), /Path escapes workspace root/);
            assert.throws(() => resolvePath(ctx, 'foo/../../outside.txt'), /Path escapes workspace root/);
        });

        it('should allow root path itself', () => {
            const p = resolvePath(ctx, '.');
            assert.strictEqual(p, testRoot);
        });
    });

    describe('readFile', () => {
        it('should read file content', async () => {
            await fs.writeFile(path.join(testRoot, 'hello.txt'), 'Hello World');
            const content = await readFile(ctx, 'hello.txt');
            assert.strictEqual(content, 'Hello World');
        });

        it('should throw if file is too large', async () => {
            const largeContent = Buffer.alloc(1024 * 1024 + 10, 'a');
            await fs.writeFile(path.join(testRoot, 'large.txt'), largeContent);
            await assert.rejects(() => readFile(ctx, 'large.txt'), /File too large/);
        });
    });

    describe('listFiles', () => {
        it('should list files matching pattern', async () => {
            await fs.writeFile(path.join(testRoot, 'a.ts'), '');
            await fs.writeFile(path.join(testRoot, 'b.js'), '');
            await fs.writeFile(path.join(testRoot, 'c.txt'), '');

            const files = await listFiles(ctx, '**/*.ts');
            assert.strictEqual(files.length, 1);
            assert.ok(files[0].endsWith('a.ts'));
        });

        it('should respect gitignore (mocked behavior via fast-glob ignores)', async () => {
            await fs.mkdir(path.join(testRoot, 'node_modules'), { recursive: true });
            await fs.writeFile(path.join(testRoot, 'node_modules/ignored.ts'), '');
            // Re-create a.ts before listing
            await fs.writeFile(path.join(testRoot, 'a.ts'), '');

            const files = await listFiles(ctx, '**/*.ts');

            assert.strictEqual(files.length, 1);
            assert.ok(files[0].endsWith('a.ts'));
        });
    });

    describe('writePatch', () => {
        it('should apply a valid patch', async () => {
            const filePath = path.join(testRoot, 'file.txt');
            await fs.writeFile(filePath, 'line1\nline2\nline3\n');

            const patch = `Index: file.txt
===================================================================
--- file.txt
+++ file.txt
@@ -1,3 +1,3 @@
 line1
-line2
+line2-modified
 line3
`;
            await writePatch(ctx, 'file.txt', patch);
            const content = await fs.readFile(filePath, 'utf8');
            assert.strictEqual(content, 'line1\nline2-modified\nline3\n');
        });

        it('should fail on mismatching patch', async () => {
            const filePath = path.join(testRoot, 'file.txt');
            await fs.writeFile(filePath, 'line1\nline2\nline3\n');

            const patch = `Index: file.txt
===================================================================
--- file.txt
+++ file.txt
@@ -1,3 +1,3 @@
 line1
-line2-WRONG
+line2-modified
 line3
`;
            await assert.rejects(() => writePatch(ctx, 'file.txt', patch), /Failed to apply patch/);
        });
    });
});
