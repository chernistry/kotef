import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writePatch } from '../../src/tools/fs.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Hybrid Patch Pipeline', () => {
    let tmpDir: string;
    let testFile: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-hybrid-test-'));
        testFile = path.join(tmpDir, 'test.ts');
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    describe('Stage 1: Strict Unified Diff', () => {
        it('should apply a perfectly matching patch', async () => {
            const original = `function hello() {
    console.log("Hello");
}`;
            await fs.writeFile(testFile, original, 'utf-8');

            const patch = `--- test.ts
+++ test.ts
@@ -1,3 +1,3 @@
 function hello() {
-    console.log("Hello");
+    console.log("Hello, World!");
 }`;

            await writePatch(testFile, patch);

            const result = await fs.readFile(testFile, 'utf-8');
            expect(result).toContain('Hello, World!');
        });

        it('should reject patches with markdown fences', async () => {
            const original = 'const x = 1;';
            await fs.writeFile(testFile, original, 'utf-8');

            const badPatch = `\`\`\`diff
--- test.ts
+++ test.ts
@@ -1 +1 @@
-const x = 1;
+const x = 2;
\`\`\``;

            await expect(writePatch(testFile, badPatch)).rejects.toThrow(/non-diff markup/);
        });
    });

    describe('Stage 2: Fuzzy Patch Fallback', () => {
        it('should fall back to fuzzy matching when strict fails due to whitespace', async () => {
            // Original file with slightly different context
            const original = `function hello() {
    console.log("Hello");
    return true;
}`;
            await fs.writeFile(testFile, original, 'utf-8');

            // Patch has different context but same target line
            const patch = `--- test.ts
+++ test.ts
@@ -1,3 +1,3 @@
 function hello() {
-    console.log("Hello");
+    console.log("Hello, World!");
 }`;

            // Strict will fail, but fuzzy should succeed
            await writePatch(testFile, patch);

            const result = await fs.readFile(testFile, 'utf-8');
            expect(result).toContain('Hello, World!');
        });

        it('should fall back to fuzzy matching when context lines differ slightly', async () => {
            const original = `// File header comment
function hello() {
    console.log("Hello");
}
// Footer comment`;
            await fs.writeFile(testFile, original, 'utf-8');

            // Patch has different context
            const patch = `--- test.ts
+++ test.ts
@@ -1,3 +1,3 @@
 function hello() {
-    console.log("Hello");
+    console.log("Hello, World!");
 }`;

            await writePatch(testFile, patch);

            const result = await fs.readFile(testFile, 'utf-8');
            expect(result).toContain('Hello, World!');
        });

        it('should reject non-code files when strict fails', async () => {
            const mdFile = path.join(tmpDir, 'test.md');
            const original = '# Title\n\nContent\n';
            await fs.writeFile(mdFile, original, 'utf-8');

            // Patch with wrong context (will fail strict)
            const patch = `--- test.md
+++ test.md
@@ -1,2 +1,2 @@
 # Title
-Content
+New Content`;

            // MD file should not use fuzzy fallback
            await expect(writePatch(mdFile, patch)).rejects.toThrow(/fuzzy fallback not available/i);
        });

        it('should fail if both strict and fuzzy fail', async () => {
            const original = `function hello() {
    console.log("Hello");
}`;
            await fs.writeFile(testFile, original, 'utf-8');

            // Patch with completely different content (no similarity)
            const patch = `--- test.ts
+++ test.ts
@@ -1,3 +1,3 @@
 class MyClass {
-    constructor() {}
+    constructor(x: number) {}
 }`;

            await expect(writePatch(testFile, patch)).rejects.toThrow(/fuzzy/i);
        });

        it('should not attempt fuzzy for very large patches', async () => {
            const original = 'const x = 1;\n'.repeat(100);
            await fs.writeFile(testFile, original, 'utf-8');

            // Create a large patch (>50 changed lines) with incorrect format
            const changes = Array.from({ length: 60 }, (_, i) =>
                `-const x = 1;\n+const x = ${i};`
            ).join('\n');

            const patch = `--- test.ts
+++ test.ts
@@ -1,100 +1,100 @@
${changes}`;

            // Should fail (either from strict or from fuzzy size limit)
            await expect(writePatch(testFile, patch)).rejects.toThrow();
        });
    });

    describe('Code File Detection', () => {
        it('should use fuzzy fallback for .js files', async () => {
            const jsFile = path.join(tmpDir, 'test.js');
            const original = `function test() {

    return 1;
}`;
            await fs.writeFile(jsFile, original, 'utf-8');

            const patch = `--- test.js
+++ test.js
@@ -1,3 +1,3 @@
 function test() {
-    return 1;
+    return 2;
 }`;

            await writePatch(jsFile, patch);
            const result = await fs.readFile(jsFile, 'utf-8');
            expect(result).toContain('return 2');
        });

        it('should use fuzzy fallback for .tsx files', async () => {
            const tsxFile = path.join(tmpDir, 'test.tsx');
            const original = `export function Component() {

    return <div>Hello</div>;
}`;
            await fs.writeFile(tsxFile, original, 'utf-8');

            const patch = `--- test.tsx
+++ test.tsx
@@ -1,3 +1,3 @@
 export function Component() {
-    return <div>Hello</div>;
+    return <div>Hello, World!</div>;
 }`;

            await writePatch(tsxFile, patch);
            const result = await fs.readFile(tsxFile, 'utf-8');
            expect(result).toContain('Hello, World!');
        });
    });
});
