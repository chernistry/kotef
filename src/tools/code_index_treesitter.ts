import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Parser, Language } = require('web-tree-sitter');
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createLogger } from '../core/logger.js';
import { CodeIndex, CodeSnippet } from './code_index.js';

const log = createLogger('code_index_treesitter');

// Language configuration
interface LanguageConfig {
    wasmPath: string;
    // Query to extract symbols
    query: string;
}

const GRAMMARS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'grammars');

const LANGUAGES: Record<string, LanguageConfig> = {
    python: {
        wasmPath: 'tree-sitter-python.wasm',
        query: `
            (function_definition name: (identifier) @name) @function
            (class_definition name: (identifier) @name) @class
        `
    },
    go: {
        wasmPath: 'tree-sitter-go.wasm',
        query: `
            (function_declaration name: (identifier) @name) @function
            (method_declaration name: (field_identifier) @name) @function
            (type_declaration (type_spec name: (type_identifier) @name)) @class
        `
    },
    rust: {
        wasmPath: 'tree-sitter-rust.wasm',
        query: `
            (function_item name: (identifier) @name) @function
            (struct_item name: (type_identifier) @name) @class
            (trait_item name: (type_identifier) @name) @interface
            (impl_item type: (type_identifier) @name) @class
        `
    },
    java: {
        wasmPath: 'tree-sitter-java.wasm',
        query: `
            (method_declaration name: (identifier) @name) @function
            (class_declaration name: (identifier) @name) @class
            (interface_declaration name: (identifier) @name) @interface
        `
    },
    typescript: {
        wasmPath: 'tree-sitter-typescript.wasm',
        query: `
            (function_declaration name: (identifier) @name) @function
            (class_declaration name: (type_identifier) @name) @class
            (interface_declaration name: (type_identifier) @name) @interface
            (type_alias_declaration name: (type_identifier) @name) @type
            (variable_declarator name: (identifier) @name) @variable
        `
    },
    tsx: {
        wasmPath: 'tree-sitter-tsx.wasm',
        query: `
            (function_declaration name: (identifier) @name) @function
            (class_declaration name: (type_identifier) @name) @class
            (interface_declaration name: (type_identifier) @name) @interface
            (type_alias_declaration name: (type_identifier) @name) @type
            (variable_declarator name: (identifier) @name) @variable
        `
    }
};

export class TreeSitterCodeIndex implements CodeIndex {
    private parsers: Map<string, any> = new Map();
    private queries: Map<string, any> = new Map();
    private symbolMap: Map<string, CodeSnippet[]> = new Map();
    private fileMap: Map<string, CodeSnippet[]> = new Map();
    private rootDir: string = '';
    private initialized = false;

    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            await Parser.init();
            log.info('web-tree-sitter initialized');
            this.initialized = true;
        } catch (e) {
            log.error('Failed to initialize web-tree-sitter', { error: e });
            throw e;
        }
    }

    private async getParser(lang: string): Promise<{ parser: any; query: any } | null> {
        if (!this.initialized) await this.init();

        const config = LANGUAGES[lang];
        if (!config) return null;

        if (this.parsers.has(lang)) {
            return {
                parser: this.parsers.get(lang)!,
                query: this.queries.get(lang)!
            };
        }

        try {
            const wasmPath = path.join(GRAMMARS_DIR, config.wasmPath);
            const language = await Language.load(wasmPath);
            const parser = new Parser();
            parser.setLanguage(language);

            const query = language.query(config.query);

            this.parsers.set(lang, parser);
            this.queries.set(lang, query);

            return { parser, query };
        } catch (e) {
            log.warn(`Failed to load grammar for ${lang}`, { error: e });
            return null;
        }
    }

    private getLanguageForFile(filePath: string): string | null {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.py': return 'python';
            case '.go': return 'go';
            case '.rs': return 'rust';
            case '.java': return 'java';
            case '.ts': return 'typescript';
            case '.tsx': return 'tsx';
            // Add more mappings as needed
            default: return null;
        }
    }

    async build(rootDir: string, filePatterns?: string[]): Promise<void> {
        log.info('Building TreeSitter code index', { rootDir });
        this.rootDir = rootDir;
        await this.init();

        // Find files manually since we don't use ts-morph's globbing
        // We can use fast-glob or just recursive walk.
        // Assuming filePatterns are globs.
        const { glob } = await import('fast-glob');

        const patterns = filePatterns || ['**/*.py', '**/*.go', '**/*.rs', '**/*.java', '**/*.ts', '**/*.tsx'];
        const exclude = ['**/node_modules/**', '**/dist/**', '**/.sdd/**', '**/test/**', '**/tests/**', '**/venv/**', '**/target/**'];

        const files = await glob(patterns, {
            cwd: rootDir,
            ignore: exclude,
            absolute: true
        });

        log.info(`Found ${files.length} files to index`);

        for (const file of files) {
            await this.indexFile(file);
        }

        log.info('TreeSitter index built', {
            fileCount: this.fileMap.size,
            symbolCount: this.symbolMap.size
        });
    }

    async update(changedFiles: string[]): Promise<void> {
        for (const filePath of changedFiles) {
            const absolutePath = path.resolve(this.rootDir, filePath);
            this.removeFileFromIndex(absolutePath);

            try {
                await fs.access(absolutePath);
                await this.indexFile(absolutePath);
            } catch {
                // Deleted
            }
        }
    }

    private async indexFile(absolutePath: string): Promise<void> {
        const lang = this.getLanguageForFile(absolutePath);
        if (!lang) return;

        const tool = await this.getParser(lang);
        if (!tool) return;

        try {
            const content = await fs.readFile(absolutePath, 'utf-8');
            const tree = tool.parser.parse(content);
            const matches = tool.query.matches(tree.rootNode);

            const snippets: CodeSnippet[] = [];
            const relPath = path.relative(this.rootDir, absolutePath);

            for (const match of matches) {
                const nameNode = match.captures.find(c => c.name === 'name')?.node;
                const defNode = match.captures.find(c => c.name !== 'name')?.node; // The definition node (function, class, etc)

                if (nameNode && defNode) {
                    const symbolName = nameNode.text;
                    const kind = match.captures.find(c => c.name !== 'name')?.name as any; // 'function', 'class', etc.

                    const snippet: CodeSnippet = {
                        path: relPath,
                        startLine: defNode.startPosition.row + 1,
                        endLine: defNode.endPosition.row + 1,
                        text: defNode.text,
                        symbolName,
                        symbolKind: kind
                    };
                    snippets.push(snippet);

                    // Update symbol map
                    const existing = this.symbolMap.get(symbolName) || [];
                    existing.push(snippet);
                    this.symbolMap.set(symbolName, existing);
                }
            }

            if (snippets.length > 0) {
                this.fileMap.set(relPath, snippets);
            }
        } catch (e) {
            log.warn(`Failed to index file ${absolutePath}`, { error: e });
        }
    }

    private removeFileFromIndex(absolutePath: string): void {
        const relPath = path.relative(this.rootDir, absolutePath);
        const snippets = this.fileMap.get(relPath);
        if (snippets) {
            for (const snippet of snippets) {
                if (snippet.symbolName) {
                    const existing = this.symbolMap.get(snippet.symbolName);
                    if (existing) {
                        const filtered = existing.filter(s => s.path !== relPath);
                        if (filtered.length > 0) {
                            this.symbolMap.set(snippet.symbolName, filtered);
                        } else {
                            this.symbolMap.delete(snippet.symbolName);
                        }
                    }
                }
            }
            this.fileMap.delete(relPath);
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
        for (const parser of this.parsers.values()) {
            parser.delete();
        }
        this.parsers.clear();
        this.queries.clear();
        this.symbolMap.clear();
        this.fileMap.clear();
    }
}
