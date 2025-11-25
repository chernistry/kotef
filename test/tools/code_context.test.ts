import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCodeContext } from '../../src/agent/utils/code_context.js';
import path from 'node:path';
import fs from 'node:fs/promises';

// Mock ts-morph
vi.mock('ts-morph', () => {
    class MockProject {
        constructor() { }
        addSourceFileAtPath = vi.fn();
        addSourceFilesAtPaths = vi.fn();
        getSourceFiles = vi.fn().mockReturnValue([
            {
                getFilePath: () => '/tmp/project/src/foo.ts',
                getEndLineNumber: () => 100,
                getText: () => 'full content',
                forEachDescendant: (cb: any) => {
                    // Mock finding a function
                    cb({
                        getName: () => 'myFunction',
                        getKindName: () => 'FunctionDeclaration',
                        getStartLineNumber: () => 10,
                        getEndLineNumber: () => 20,
                        getText: () => 'function myFunction() {}',
                        getParent: () => null
                    });
                }
            }
        ]);
    }

    return {
        Project: MockProject,
        Node: {
            isFunctionDeclaration: () => true,
            isClassDeclaration: () => false,
            isInterfaceDeclaration: () => false,
            isVariableDeclaration: () => false,
            isMethodDeclaration: () => false
        },
        SyntaxKind: {}
    };
});

describe('Code Context', () => {
    it('should find symbol in file', async () => {
        const snippets = await getCodeContext({
            rootDir: '/tmp/project',
            file: 'src/foo.ts',
            symbol: 'myFunction'
        });

        expect(snippets.length).toBe(1);
        expect(snippets[0].file).toBe('src/foo.ts');
        expect(snippets[0].text).toBe('function myFunction() {}');
    });
});
