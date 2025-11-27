export const CODER_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read a file from the workspace',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to file' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_files',
            description:
                'List files in the workspace matching an optional glob pattern (defaults to common source files).',
            parameters: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                        description:
                            'Optional glob pattern relative to repo root (e.g. "src/**/*.ts").'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Create or overwrite a file with content',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to file' },
                    content: { type: 'string', description: 'File content' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_patch',
            description: 'Apply a unified diff patch to an existing file',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Relative path to file' },
                    diff: { type: 'string', description: 'Unified diff content' }
                },
                required: ['path', 'diff']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description:
                'Run a shell command in the project directory (e.g., npm install, npm run build)',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Shell command to execute' }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_tests',
            description:
                'Run the project test command (or a specific one) in the project directory.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description:
                            'Optional explicit test command (e.g., "npm test"). If omitted, use the default from SDD or package.json.'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_diagnostic',
            description:
                'Run the best-fit build/test command once to see real errors before making changes (error-first strategy).',
            parameters: {
                type: 'object',
                properties: {
                    kind: {
                        type: 'string',
                        enum: ['auto', 'build', 'test', 'lint'],
                        description:
                            'Optional hint: prefer build vs test vs lint; defaults to auto selection.'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_code_context',
            description: 'Get relevant code snippets from the project using semantic search (file, symbol). Prefer this over reading entire files when looking for specific definitions.',
            parameters: {
                type: 'object',
                properties: {
                    file: { type: 'string', description: 'Optional file path to scope the search' },
                    symbol: { type: 'string', description: 'Optional symbol name (function, class, etc.) to find' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'apply_edits',
            description: 'Apply a JSON-described set of text edits to a file.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string' },
                    edits: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                range: {
                                    type: 'object',
                                    properties: {
                                        start: { type: 'number' },
                                        end: { type: 'number' }
                                    },
                                    required: ['start', 'end']
                                },
                                newText: { type: 'string' }
                            },
                            required: ['range', 'newText']
                        }
                    }
                },
                required: ['path', 'edits']
            }
        }
    }
];
