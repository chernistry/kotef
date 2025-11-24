import { AgentState, ExecutionProfile } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

import { loadRuntimePrompt } from '../../core/prompts.js';
import { callChat, ChatMessage } from '../../core/llm.js';
import { readFile, writeFile, writePatch } from '../../tools/fs.js';
import { runCommand } from '../../tools/test_runner.js';

export function coderNode(cfg: KotefConfig, chatFn = callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('coder');
        log.info('Coder node started');
        
        const promptTemplate = await loadRuntimePrompt('coder');

        const safe = (value: unknown) => {
            if (value === undefined || value === null) return '';
            if (typeof value === 'string') return value;
            return JSON.stringify(value, null, 2);
        };
        const summarize = (value: unknown, maxChars: number) => {
            const text = safe(value);
            if (text.length <= maxChars) return text;
            return text.slice(0, maxChars) + '\n\n...[truncated; use read_file(\".sdd/*\") for full spec]';
        };

        const inferProfile = (): ExecutionProfile => {
            if (state.runProfile) return state.runProfile;
            const architectText = state.sdd.architect || '';
            const strictSignals = [
                '--cov',
                'coverage',
                'mypy',
                'pylint',
                'black',
                'lint',
                'pre-commit'
            ];
            const hasStrictSignal = strictSignals.some(sig => architectText.includes(sig));
            return hasStrictSignal ? 'strict' : 'fast';
        };

        const executionProfile = inferProfile();

        const replacements: Record<string, string> = {
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{GOAL}}': safe(state.sdd.goal),
            '{{SDD_PROJECT}}': summarize(state.sdd.project, 4000),
            '{{SDD_ARCHITECT}}': summarize(state.sdd.architect, 4000),
            '{{SDD_BEST_PRACTICES}}': summarize(state.sdd.bestPractices, 4000),
            '{{RESEARCH_RESULTS}}': safe(state.researchResults),
            '{{STATE_PLAN}}': safe(state.plan),
            '{{EXECUTION_PROFILE}}': executionProfile
        };

        let systemPrompt = promptTemplate;
        for (const [token, value] of Object.entries(replacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...state.messages,
            {
                role: 'user',
                content: `Implement the ticket with minimal diffs. Plan: ${safe(state.plan)}`
            }
        ];

        // Define tools for the coder
        const tools = [
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
            }
        ];

        // Call LLM with tools
        // We might need a loop here if the LLM wants to make multiple tool calls.
        // For MVP, let's do one turn: LLM -> Tool -> LLM (confirmation).
        // Or better, use a loop until LLM stops calling tools.
        // But `callChat` in core/llm.ts handles tool execution if we pass a handler?
        // Let's check callChat signature. It returns `toolCalls`. It does NOT execute them automatically unless we implemented that loop in `llm.ts`.
        // The `callChat` in `src/core/llm.ts` (Ticket 01) was a "thin wrapper".
        // Let's assume we need to handle execution here or `callChat` does it.
        // Re-reading Ticket 01 sketch: "Thin wrapper around OpenAI-compatible SDK".
        // So we likely need to execute tools here.

        // Let's do a simple loop for max turns.
        const currentMessages = [...messages];
        let turns = 0;
        const maxTurns = 20; // Increased for large context models
        let fileChanges = state.fileChanges || {};

        log.info('Starting coder tool execution loop', { maxTurns });
        
        while (turns < maxTurns) {
            log.info(`Coder turn ${turns + 1}/${maxTurns}: Calling LLM...`);
            const response = await chatFn(cfg, currentMessages, {
                model: cfg.modelStrong, // Coder uses strong model
                tools: tools as any // Cast to avoid strict type mismatch if any
            });

            const msg = response.messages[response.messages.length - 1];
            currentMessages.push(msg);

            if (!msg.tool_calls || msg.tool_calls.length === 0) {
                log.info('No more tool calls, coder finished');
                // No more tools, we are done
                break;
            }

            log.info(`Executing ${msg.tool_calls.length} tool calls`);
            
            // Execute tools
            for (const toolCall of msg.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                let result: any;

                log.info('Executing tool', { tool: toolCall.function.name, args });

                try {
                    if (toolCall.function.name === 'read_file') {
                        result = await readFile({ rootDir: cfg.rootDir! }, args.path);
                        log.info('File read', { path: args.path, size: result.length });
                    } else if (toolCall.function.name === 'list_files') {
                        // Lazy-load to avoid circular imports at top
                        const { listFiles } = await import('../../tools/fs.js');
                        const pattern =
                            typeof args.pattern === 'string' && args.pattern.trim().length > 0
                                ? args.pattern
                                : '**/*.{ts,tsx,js,jsx,py,rs,go,php,java,cs,md,mdx,json,yml,yaml,pyw}';
                        const files = await listFiles({ rootDir: cfg.rootDir! }, pattern);
                        result = files;
                        log.info('Files listed', { pattern, count: files.length });
                    } else if (toolCall.function.name === 'write_file') {
                        await writeFile({ rootDir: cfg.rootDir! }, args.path, args.content);
                        result = "File written successfully.";
                        // Record change
                        fileChanges = { ...(fileChanges || {}), [args.path]: 'created' };
                        log.info('File written', { path: args.path, size: args.content.length });
                    } else if (toolCall.function.name === 'write_patch') {
                        await writePatch({ rootDir: cfg.rootDir! }, args.path, args.diff);
                        result = "Patch applied successfully.";
                        // Record change
                        fileChanges = { ...(fileChanges || {}), [args.path]: 'patched' };
                        log.info('Patch applied', { path: args.path });
                    } else if (toolCall.function.name === 'run_command') {
                        const cmdResult = await runCommand(cfg, args.command);
                        result = {
                            exitCode: cmdResult.exitCode,
                            stdout: cmdResult.stdout,
                            stderr: cmdResult.stderr,
                            passed: cmdResult.passed
                        };
                        log.info('Command executed', {
                            command: args.command,
                            exitCode: cmdResult.exitCode,
                            passed: cmdResult.passed
                        });
                    } else if (toolCall.function.name === 'run_tests') {
                        const command =
                            typeof args.command === 'string' && args.command.trim().length > 0
                                ? args.command
                                : 'npm test';
                        const cmdResult = await runCommand(cfg, command);
                        result = {
                            exitCode: cmdResult.exitCode,
                            stdout: cmdResult.stdout,
                            stderr: cmdResult.stderr,
                            passed: cmdResult.passed
                        };
                        log.info('Tests executed', {
                            command,
                            exitCode: cmdResult.exitCode,
                            passed: cmdResult.passed
                        });
                    } else {
                        result = "Unknown tool";
                        log.warn('Unknown tool called', { tool: toolCall.function.name });
                    }
                } catch (e: any) {
                    result = `Error: ${e.message}`;
                    log.error('Tool execution failed', { tool: toolCall.function.name, error: e.message });
                }

                currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }
            turns++;
        }

        log.info('Coder node completed', { turns, filesChanged: Object.keys(fileChanges).length });

        return {
            fileChanges,
            messages: currentMessages.slice(messages.length) // Append new messages
        };
    };
}
