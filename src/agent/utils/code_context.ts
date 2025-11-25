import { Project, Node, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createLogger } from '../../core/logger.js';

const log = createLogger('code_context');

export interface CodeSnippet {
    file: string;
    startLine: number;
    endLine: number;
    text: string;
    kind?: string;
}

export interface CodeContextRequest {
    file?: string;
    symbol?: string;
    errorMessage?: string;
    rootDir: string;
}

// Simple in-memory cache for the project instance
// In a real agent, this might need to be managed more carefully (e.g. invalidated on file changes)
// For now, we'll recreate it per request or rely on ts-morph's internal caching if we keep the instance alive.
// However, since the agent runs nodes in a loop, keeping a global instance might be tricky if files change on disk.
// Let's create a fresh project for now, or cache it with a simple invalidation strategy.
// Given the "one-shot" nature of some tools, let's start with fresh project but restricted scope.

export async function getCodeContext(req: CodeContextRequest): Promise<CodeSnippet[]> {
    const { file, symbol, rootDir } = req;
    const snippets: CodeSnippet[] = [];

    if (!file && !symbol) {
        return [];
    }

    try {
        // Initialize ts-morph project
        // We skip adding all files to improve performance, only adding what we need.
        const project = new Project({
            tsConfigFilePath: path.join(rootDir, 'tsconfig.json'),
            skipAddingFilesFromTsConfig: true,
        });

        const filesToScan: string[] = [];

        if (file) {
            const absPath = path.resolve(rootDir, file);
            filesToScan.push(absPath);
        } else {
            // If searching by symbol without file, we might need to scan more files.
            // For MVP, let's assume we scan src/**/* if no file provided, or fail.
            // Scanning everything is slow.
            // Let's restrict to src/ for now if no file.
            // Actually, ts-morph can add source files from globs.
            // But let's be conservative. If no file, maybe we shouldn't support global symbol search yet?
            // Ticket says "reuses previously read/parsed files where possible".
            // Let's support file+symbol or just file.
            // If just symbol, maybe we can't do it efficiently without an index.
            // Let's support file+symbol first.
            if (symbol) {
                // If only symbol is provided, we'd need a global index. 
                // For this MVP, let's try to find the symbol in the provided file, 
                // or if no file, maybe return empty or error?
                // Let's assume file is required for now unless we do a glob.
                // Ticket says: "accepts a query (file path, symbol name, or error location)".
                // Let's try to support global search in src if file is missing.
                const glob = path.join(rootDir, 'src', '**', '*.{ts,tsx}');
                project.addSourceFilesAtPaths(glob);
            }
        }

        if (file) {
            project.addSourceFileAtPath(path.resolve(rootDir, file));
        }

        const sourceFiles = project.getSourceFiles();

        for (const sourceFile of sourceFiles) {
            if (symbol) {
                // Find symbol
                // We look for functions, classes, interfaces, variables
                sourceFile.forEachDescendant((node) => {
                    // Check if node has a name and matches the symbol
                    const hasName = typeof (node as any).getName === 'function';
                    if (hasName && (node as any).getName() === symbol) {
                        // We found a match.
                        // We want the whole declaration.
                        // But wait, if it's a usage, we might not want it.
                        // We usually want definitions.
                        // Let's check if it's a declaration.
                        if (
                            Node.isFunctionDeclaration(node) ||
                            Node.isClassDeclaration(node) ||
                            Node.isInterfaceDeclaration(node) ||
                            Node.isVariableDeclaration(node) ||
                            Node.isMethodDeclaration(node)
                        ) {
                            // Get the parent for variable declaration list if needed, but usually the node is fine.
                            // For variable declaration, the parent is VariableDeclarationList, then VariableStatement.
                            let targetNode: Node = node;
                            if (Node.isVariableDeclaration(node)) {
                                targetNode = node.getParent()?.getParent() || node;
                            }

                            snippets.push({
                                file: path.relative(rootDir, sourceFile.getFilePath()),
                                startLine: targetNode.getStartLineNumber(),
                                endLine: targetNode.getEndLineNumber(),
                                text: targetNode.getText(),
                                kind: targetNode.getKindName()
                            });
                        }
                    }
                });
            } else if (file) {
                // If file but no symbol, return the whole file?
                // Or maybe outline?
                // Ticket says "returns a bundle of relevant code snippets".
                // If just file, maybe return the whole file content as one snippet?
                // Or maybe we don't support just file here, as read_file does that.
                // But the tool is "get_code_context".
                // If I ask for a file, I probably want the file.
                snippets.push({
                    file: path.relative(rootDir, sourceFile.getFilePath()),
                    startLine: 1,
                    endLine: sourceFile.getEndLineNumber(),
                    text: sourceFile.getText(),
                    kind: 'SourceFile'
                });
            }
        }

    } catch (e: any) {
        log.error('Error getting code context', { error: e.message || String(e), stack: e.stack });
    }

    return snippets;
}
