import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

import { loadRuntimePrompt } from '../../core/prompts.js';
import { callChat, ChatMessage } from '../../core/llm.js';
import { readFile, writeFile, writePatch } from '../../tools/fs.js';
import { runCommand } from '../../tools/test_runner.js';
import { resolveExecutionProfile, PROFILE_POLICIES, looksLikeInstall, ExecutionProfile } from '../profiles.js';

export function coderNode(cfg: KotefConfig, chatFn = callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('coder');
        log.info('Coder node started', { taskScope: state.taskScope });

        const isTinyTask = state.taskScope === 'tiny';
        const heavyCommandPatterns = [
            /\bpytest\b/i,
            /\bnpm\s+test\b/i,
            /\bpnpm\s+test\b/i,
            /\byarn\s+test\b/i,
            /\bmypy\b/i,
            /\bpylint\b/i,
            /\bruff\b/i,
            /\bbandit\b/i,
            /\bflake8\b/i,
            /\bblack\b/i,
            /\bpre-commit\b/i,
            /\bflet\s+run\b/i,
            /\bplaywright\b/i
        ];
        const looksHeavyCommand = (cmd: string) => heavyCommandPatterns.some((regex) => regex.test(cmd));

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
        const policy = PROFILE_POLICIES[executionProfile];
        const profileTurns: Record<ExecutionProfile, number> = {
            strict: 20,
            fast: 12,
            smoke: 6,
            yolo: 50
        };

        const replacements: Record<string, string> = {
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{GOAL}}': safe(state.sdd.goal),
            '{{SDD_PROJECT}}': summarize(state.sdd.project, 2500),
            '{{SDD_ARCHITECT}}': summarize(state.sdd.architect, 2500),
            '{{SDD_BEST_PRACTICES}}': summarize(state.sdd.bestPractices, 2500),
            '{{RESEARCH_RESULTS}}': safe(state.researchResults),
            '{{STATE_PLAN}}': safe(state.plan),
            '{{EXECUTION_PROFILE}}': executionProfile
        };

        let systemPrompt = promptTemplate;
        for (const [token, value] of Object.entries(replacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
        }

        // Use summaries if available (significantly reduces token usage)
        if (state.sddSummaries) {
            systemPrompt = systemPrompt.replaceAll('{{SDD_PROJECT}}', state.sddSummaries.projectSummary);
            systemPrompt = systemPrompt.replaceAll('{{SDD_ARCHITECT}}', state.sddSummaries.architectSummary);
            systemPrompt = systemPrompt.replaceAll('{{SDD_BEST_PRACTICES}}', state.sddSummaries.bestPracticesSummary);
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

        // Tool execution loop
        const currentMessages = [...messages];
        let turns = 0;
        const maxTurns = profileTurns[executionProfile] ?? 20;

        let commandCount = 0;
        let testCount = 0;
        let fileChanges = state.fileChanges || {};

        log.info('Starting coder tool execution loop', { maxTurns, profile: executionProfile });

        const trimHistory = (all: ChatMessage[]): ChatMessage[] => {
            if (all.length <= 30) return all;
            const system = all[0];
            const rest = all.slice(1);
            const tail = rest.slice(-20);
            return [system, ...tail];
        };

        while (turns < maxTurns) {
            log.info(`Coder turn ${turns + 1}/${maxTurns}: Calling LLM...`);
            const response = await chatFn(cfg, trimHistory(currentMessages), {
                model: cfg.modelStrong,
                tools: tools as any,
                maxTokens: 32000,
                temperature: 0
            });

            const msg = response.messages[response.messages.length - 1];
            currentMessages.push(msg);

            if (!msg.tool_calls || msg.tool_calls.length === 0) {
                log.info('No more tool calls, coder finished');
                break;
            }

            log.info(`Executing ${msg.tool_calls.length} tool calls`);

            for (const toolCall of msg.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                let result: any;

                log.info('Executing tool', { tool: toolCall.function.name, args });

                try {
                    if (toolCall.function.name === 'read_file') {
                        result = await readFile({ rootDir: cfg.rootDir! }, args.path);
                        log.info('File read', { path: args.path, size: result.length });
                    } else if (toolCall.function.name === 'list_files') {
                        const { listFiles } = await import('../../tools/fs.js');
                        const pattern =
                            typeof args.pattern === 'string' && args.pattern.trim().length > 0
                                ? args.pattern
                                : '**/*.{ts,tsx,js,jsx,py,rs,go,php,java,cs,md,mdx,json,yml,yaml,pyw}';
                        const files = await listFiles({ rootDir: cfg.rootDir! }, pattern);
                        result = files;
                        log.info('Files listed', { pattern, count: files.length });
                    } else if (toolCall.function.name === 'write_file') {
                        if (!args.content) {
                            result = "Error: write_file requires 'content' parameter. Please provide the full file content.";
                            log.error('write_file called without content', { path: args.path });
                        } else {
                            await writeFile({ rootDir: cfg.rootDir! }, args.path, args.content);
                            result = "File written successfully.";
                            fileChanges = { ...(fileChanges || {}), [args.path]: 'created' };
                            log.info('File written', { path: args.path, size: args.content.length });
                        }
                    } else if (toolCall.function.name === 'write_patch') {
                        await writePatch({ rootDir: cfg.rootDir! }, args.path, args.diff);
                        result = "Patch applied successfully.";
                        fileChanges = { ...(fileChanges || {}), [args.path]: 'patched' };
                        log.info('Patch applied', { path: args.path });
                    } else if (toolCall.function.name === 'run_command') {
                        const commandStr = typeof args.command === 'string' ? args.command : '';
                        const tinySkip = isTinyTask && executionProfile !== 'strict' && looksHeavyCommand(commandStr);
                        if (tinySkip) {
                            result = `Skipped "${commandStr}" because task scope is tiny under profile "${executionProfile}". Provide a short note instead of running heavy commands.`;
                            log.info('Command skipped by tiny-task policy', { command: commandStr });
                        } else {
                            commandCount += 1;
                            if (commandCount > policy.maxCommands) {
                                result = `Skipped command: budget exceeded for profile "${executionProfile}" (max ${policy.maxCommands}).`;
                                log.info('Command skipped by profile limit', { command: commandStr });
                            } else if (!policy.allowPackageInstalls && looksLikeInstall(commandStr)) {
                                result = `Skipped command: package installs not allowed in profile "${executionProfile}".`;
                                log.info('Install skipped by profile', { command: commandStr });
                            } else {
                                const cmdResult = await runCommand(cfg, commandStr);
                                result = {
                                    exitCode: cmdResult.exitCode,
                                    stdout: cmdResult.stdout,
                                    stderr: cmdResult.stderr,
                                    passed: cmdResult.passed
                                };
                                log.info('Command executed', {
                                    command: commandStr,
                                    exitCode: cmdResult.exitCode,
                                    passed: cmdResult.passed
                                });
                            }
                        }
                    } else if (toolCall.function.name === 'run_tests') {
                        const tinySkip = isTinyTask && executionProfile !== 'strict';
                        if (tinySkip) {
                            result = `Skipped automated tests because task scope is tiny under profile "${executionProfile}". Describe manual verification instead.`;
                            log.info('Tests skipped by tiny-task policy', { requestedCommand: args.command });
                        } else {
                            testCount += 1;
                            if (testCount > policy.maxTestRuns) {
                                result = `Skipped tests: budget exceeded for profile "${executionProfile}" (max ${policy.maxTestRuns}).`;
                                log.info('Tests skipped by profile limit', { requestedCommand: args.command });
                            } else {
                                let command: string;
                                if (typeof args.command === 'string' && args.command.trim().length > 0) {
                                    command = args.command;
                                } else {
                                    const hasPy = state.sdd.project?.includes('Python') || state.sdd.project?.includes('pyproject.toml');
                                    command = hasPy ? 'pytest' : 'npm test';
                                }
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
                            }
                        }
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

        const initialFileCount = Object.keys(state.fileChanges || {}).length;
        const finalFileCount = Object.keys(fileChanges).length;
        const hasNewChanges = finalFileCount > initialFileCount;

        const consecutiveNoOps = hasNewChanges ? 0 : (state.consecutiveNoOps || 0) + 1;

        log.info('Coder node completed', {
            turns,
            filesChanged: finalFileCount,
            newChanges: hasNewChanges,
            consecutiveNoOps
        });

        return {
            fileChanges,
            messages: currentMessages.slice(messages.length),
            consecutiveNoOps
        };
    };
}
