import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import { createLogger } from '../core/logger.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const log = createLogger('code_index');

export interface CodeSnippet {
    path: string;
    startLine: number;
    endLine: number;
    text: string;
    symbolName?: string;
    symbolKind?: 'function' | 'class' | 'interface' | 'const' | 'type' | 'variable';
}

export interface CodeIndex {
    build(rootDir: string, filePatterns?: string[]): Promise<void>;
    update(changedFiles: string[]): Promise<void>;
    querySymbol(symbolName: string): CodeSnippet[];
    queryFile(filePath: string): CodeSnippet[];
    dispose(): void;
}

class TsMorphCodeIndex implements CodeIndex {
    private project: Project | null = null;
    private rootDir: string = '';
    private symbolMap: Map<string, CodeSnippet[]> = new Map();
    private fileMap: Map<string, CodeSnippet[]> = new Map();

    async build(rootDir: string, filePatterns?: string[]): Promise<void> {
        log.info('Building code index', { rootDir });
        this.rootDir = rootDir;

        // Create ts-morph project
        const tsConfigPath = path.join(rootDir, 'tsconfig.json');
        let tsConfigExists = false;

        try {
            await fs.access(tsConfigPath);
            tsConfigExists = true;
        } catch {
            // No tsconfig, will use default
        }

        this.project = new Project({
            tsConfigFilePath: tsConfigExists ? tsConfigPath : undefined,
            skipAddingFilesFromTsConfig: !tsConfigExists,
        });

        // Add source files based on patterns
        const patterns = filePatterns || ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
        const exclude = ['**/node_modules/**', '**/dist/**', '**/.sdd/**', '**/test/**', '**/tests/**'];

        for (const pattern of patterns) {
            this.project.addSourceFilesAtPaths(
                path.join(rootDir, pattern)
            );
        }

        // Remove excluded files
        const allFiles = this.project.getSourceFiles();
        for (const file of allFiles) {
            const relPath = path.relative(rootDir, file.getFilePath());
            if (exclude.some(ex => relPath.includes(ex.replace(/\*\*/g, '').replace(/\*/g, '')))) {
                this.project.removeSourceFile(file);
            }
        }

        // Index all files
        await this.indexAllFiles();

        log.info('Code index built', {
            fileCount: this.project.getSourceFiles().length,
            symbolCount: this.symbolMap.size
        });
    }

    async update(changedFiles: string[]): Promise<void> {
        if (!this.project) {
            log.warn('Cannot update index: not initialized');
            return;
        }

        log.info('Updating code index', { fileCount: changedFiles.length });

        for (const filePath of changedFiles) {
            const absolutePath = path.resolve(this.rootDir, filePath);

            // Remove old entries
            this.removeFileFromIndex(absolutePath);

            // Re-add file if it still exists
            try {
                await fs.access(absolutePath);
                const sourceFile = this.project.addSourceFileAtPath(absolutePath);
                this.indexFile(sourceFile);
            } catch {
                // File was deleted, already removed from index
                log.debug('File deleted, removed from index', { filePath });
            }
        }
    }

    querySymbol(symbolName: string): CodeSnippet[] {
        return this.symbolMap.get(symbolName) || [];
    }

    queryFile(filePath: string): CodeSnippet[] {
        const normalizedPath = path.normalize(filePath);
        return this.fileMap.get(normalizedPath) || [];
    }

    dispose(): void {
        this.project = null;
        this.symbolMap.clear();
        this.fileMap.clear();
        log.info('Code index disposed');
    }

    private async indexAllFiles(): Promise<void> {
        if (!this.project) return;

        const sourceFiles = this.project.getSourceFiles();
        for (const sourceFile of sourceFiles) {
            this.indexFile(sourceFile);
        }
    }

    private indexFile(sourceFile: SourceFile): void {
        const filePath = path.relative(this.rootDir, sourceFile.getFilePath());
        const snippets: CodeSnippet[] = [];

        // Extract top-level declarations
        for (const statement of sourceFile.getStatements()) {
            const snippet = this.extractSnippet(statement, filePath);
            if (snippet) {
                snippets.push(snippet);

                // Add to symbol map
                if (snippet.symbolName) {
                    const existing = this.symbolMap.get(snippet.symbolName) || [];
                    existing.push(snippet);
                    this.symbolMap.set(snippet.symbolName, existing);
                }
            }
        }

        // Add to file map
        if (snippets.length > 0) {
            this.fileMap.set(filePath, snippets);
        }
    }

    private extractSnippet(node: Node, filePath: string): CodeSnippet | null {
        let symbolName: string | undefined;
        let symbolKind: CodeSnippet['symbolKind'] | undefined;

        // Check node type and extract name
        if (Node.isFunctionDeclaration(node)) {
            symbolName = node.getName();
            symbolKind = 'function';
        } else if (Node.isClassDeclaration(node)) {
            symbolName = node.getName();
            symbolKind = 'class';
        } else if (Node.isInterfaceDeclaration(node)) {
            symbolName = node.getName();
            symbolKind = 'interface';
        } else if (Node.isTypeAliasDeclaration(node)) {
            symbolName = node.getName();
            symbolKind = 'type';
        } else if (Node.isVariableStatement(node)) {
            // Get first variable declaration
            const declarations = node.getDeclarations();
            if (declarations.length > 0) {
                const decl = declarations[0];
                symbolName = decl.getName();
                // Check if it's a const by looking at the parent variable statement
                const declKind = node.getDeclarationKind();
                symbolKind = declKind === 'const' ? 'const' : 'variable';
            }
        } else {
            // Skip other node types
            return null;
        }

        if (!symbolName) {
            return null;
        }

        const startLine = node.getStartLineNumber();
        const endLine = node.getEndLineNumber();
        const text = node.getText();

        return {
            path: filePath,
            startLine,
            endLine,
            text,
            symbolName,
            symbolKind,
        };
    }

    private removeFileFromIndex(absolutePath: string): void {
        const filePath = path.relative(this.rootDir, absolutePath);

        // Remove from file map
        const snippets = this.fileMap.get(filePath);
        if (snippets) {
            // Remove symbols associated with this file
            for (const snippet of snippets) {
                if (snippet.symbolName) {
                    const symbolSnippets = this.symbolMap.get(snippet.symbolName);
                    if (symbolSnippets) {
                        const filtered = symbolSnippets.filter(s => s.path !== filePath);
                        if (filtered.length > 0) {
                            this.symbolMap.set(snippet.symbolName, filtered);
                        } else {
                            this.symbolMap.delete(snippet.symbolName);
                        }
                    }
                }
            }

            this.fileMap.delete(filePath);
        }

        // Remove from ts-morph project
        if (this.project) {
            const sourceFile = this.project.getSourceFile(absolutePath);
            if (sourceFile) {
                this.project.removeSourceFile(sourceFile);
            }
        }
    }
}

// Singleton instance
let globalIndex: CodeIndex | null = null;

export function getCodeIndex(): CodeIndex {
    if (!globalIndex) {
        globalIndex = new TsMorphCodeIndex();
    }
    return globalIndex;
}

export function resetCodeIndex(): void {
    if (globalIndex) {
        globalIndex.dispose();
        globalIndex = null;
    }
}
