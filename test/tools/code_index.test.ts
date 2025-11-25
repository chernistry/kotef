import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCodeIndex, resetCodeIndex } from '../../src/tools/code_index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Code Index', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'code-index-test-'));
        resetCodeIndex(); // Reset singleton between tests
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
        resetCodeIndex();
    });

    describe('build', () => {
        it('should build index for TypeScript project', async () => {
            // Create test files
            await fs.writeFile(
                path.join(tmpDir, 'example.ts'),
                `export function hello(name: string) {
    return \`Hello, \${name}!\`;
}

export class Greeter {
    greet(name: string) {
        return hello(name);
    }
}`
            );

            await fs.writeFile(
                path.join(tmpDir, 'types.ts'),
                `export interface User {
    name: string;
    age: number;
}

export type ID = string | number;`
            );

            const index = getCodeIndex();
            await index.build(tmpDir);

            // Verify symbols were indexed
            const helloSnippets = index.querySymbol('hello');
            expect(helloSnippets).toHaveLength(1);
            expect(helloSnippets[0].symbolKind).toBe('function');
            expect(helloSnippets[0].text).toContain('Hello');

            const greeterSnippets = index.querySymbol('Greeter');
            expect(greeterSnippets).toHaveLength(1);
            expect(greeterSnippets[0].symbolKind).toBe('class');

            const userSnippets = index.querySymbol('User');
            expect(userSnippets).toHaveLength(1);
            expect(userSnippets[0].symbolKind).toBe('interface');

            const idSnippets = index.querySymbol('ID');
            expect(idSnippets).toHaveLength(1);
            expect(idSnippets[0].symbolKind).toBe('type');
        });

        it('should handle projects without tsconfig', async () => {
            await fs.writeFile(
                path.join(tmpDir, 'simple.ts'),
                `function test() {
    return 42;
}`
            );

            const index = getCodeIndex();
            await index.build(tmpDir);

            const snippets = index.querySymbol('test');
            expect(snippets).toHaveLength(1);
        });
    });

    describe('querySymbol', () => {
        beforeEach(async () => {
            await fs.writeFile(
                path.join(tmpDir, 'code.ts'),
                `export function foo() {}
export function bar() {}
export const baz = 123;`
            );

            const index = getCodeIndex();
            await index.build(tmpDir);
        });

        it('should find symbol by exact name', () => {
            const index = getCodeIndex();
            const snippets = index.querySymbol('foo');

            expect(snippets).toHaveLength(1);
            expect(snippets[0].symbolName).toBe('foo');
            expect(snippets[0].symbolKind).toBe('function');
        });

        it('should return empty array for unknown symbol', () => {
            const index = getCodeIndex();
            const snippets = index.querySymbol('nonexistent');

            expect(snippets).toHaveLength(0);
        });

        it('should find const declarations', () => {
            const index = getCodeIndex();
            const snippets = index.querySymbol('baz');

            expect(snippets).toHaveLength(1);
            expect(snippets[0].symbolKind).toBe('const');
        });
    });

    describe('queryFile', () => {
        beforeEach(async () => {
            await fs.writeFile(
                path.join(tmpDir, 'myfile.ts'),
                `export function alpha() {}
export function beta() {}`
            );

            const index = getCodeIndex();
            await index.build(tmpDir);
        });

        it('should return all symbols in a file', () => {
            const index = getCodeIndex();
            const snippets = index.queryFile('myfile.ts');

            expect(snippets).toHaveLength(2);
            expect(snippets.map(s => s.symbolName).sort()).toEqual(['alpha', 'beta']);
        });

        it('should return empty array for unknown file', () => {
            const index = getCodeIndex();
            const snippets = index.queryFile('nonexistent.ts');

            expect(snippets).toHaveLength(0);
        });
    });

    describe('update', () => {
        it('should update index when file changes', async () => {
            await fs.writeFile(
                path.join(tmpDir, 'dynamic.ts'),
                `export function oldFunction() {}`
            );

            const index = getCodeIndex();
            await index.build(tmpDir);

            // Verify old symbol exists
            let snippets = index.querySymbol('oldFunction');
            expect(snippets).toHaveLength(1);

            // Update file
            await fs.writeFile(
                path.join(tmpDir, 'dynamic.ts'),
                `export function newFunction() {}`
            );

            // Update index
            await index.update(['dynamic.ts']);

            // Old symbol should be gone
            snippets = index.querySymbol('oldFunction');
            expect(snippets).toHaveLength(0);

            // New symbol should exist
            snippets = index.querySymbol('newFunction');
            expect(snippets).toHaveLength(1);
        });

        it('should handle file deletion', async () => {
            await fs.writeFile(
                path.join(tmpDir, 'temp.ts'),
                `export function tempFunc() {}`
            );

            const index = getCodeIndex();
            await index.build(tmpDir);

            // Verify symbol exists
            let snippets = index.querySymbol('tempFunc');
            expect(snippets).toHaveLength(1);

            // Delete file
            await fs.unlink(path.join(tmpDir, 'temp.ts'));

            // Update index
            await index.update(['temp.ts']);

            // Symbol should be gone
            snippets = index.querySymbol('tempFunc');
            expect(snippets).toHaveLength(0);
        });
    });

    describe('performance', () => {
        it('should be fast on second query (caching)', async () => {
            await fs.writeFile(
                path.join(tmpDir, 'perf.ts'),
                `export function perfTest() {}`
            );

            const index = getCodeIndex();
            await index.build(tmpDir);

            // First query
            const start1 = Date.now();
            index.querySymbol('perfTest');
            const time1 = Date.now() - start1;

            // Second query (should be instant from cache)
            const start2 = Date.now();
            index.querySymbol('perfTest');
            const time2 = Date.now() - start2;

            // Second query should be much faster (or same if both instant)
            expect(time2).toBeLessThanOrEqual(time1);
        });
    });
});
