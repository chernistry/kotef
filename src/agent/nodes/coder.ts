import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

import { loadRuntimePrompt } from '../../core/prompts.js';
import { callChat, ChatMessage } from '../../core/llm.js';
import { readFile, writeFile, writePatch, applyEdits } from '../../tools/fs.js';
import { runCommand } from '../../tools/test_runner.js';
import { resolveExecutionProfile, PROFILE_POLICIES, looksLikeInstall, ExecutionProfile } from '../profiles.js';
import { detectCommands } from '../utils/verification.js';
import { recordFunctionalProbe } from '../utils/functional_checks.js';
import crypto from 'node:crypto';

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
            yolo: 500
        };

        // Apply config override if set (Ticket 23)
        const profileDefault = profileTurns[executionProfile] ?? 20;
        const configuredMax = cfg.maxCoderTurns && cfg.maxCoderTurns > 0 ? cfg.maxCoderTurns : 0;
        // If configured, treat it as an explicit cap (within a global safety bound); otherwise use profile default.
        const effectiveConfigured = configuredMax > 0 ? Math.min(configuredMax, 500) : 0;
        const maxTurns = effectiveConfigured > 0 ? effectiveConfigured : profileDefault;

        log.info('Coder turn budget', {
            executionProfile,
            profileDefault,
            configuredMax: cfg.maxCoderTurns || null,
            effectiveMaxTurns: maxTurns
        });

        const replacements: Record<string, string> = {
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{GOAL}}': safe(state.sdd.goal),
            '{{PROJECT_SUMMARY}}': safe(JSON.stringify(state.projectSummary, null, 2)),
            '{{SDD_PROJECT}}': summarize(state.sdd.project, 2500),
            '{{SDD_ARCHITECT}}': summarize(state.sdd.architect, 2500),
            '{{SDD_BEST_PRACTICES}}': summarize(state.sdd.bestPractices, 2500),
            '{{RESEARCH_RESULTS}}': safe(state.researchResults),
            '{{STATE_PLAN}}': safe(state.plan),
            '{{EXECUTION_PROFILE}}': executionProfile,
            '{{TASK_SCOPE}}': state.taskScope || 'normal',
            '{{DIAGNOSTICS}}': (await import('../utils/diagnostics.js')).summarizeDiagnostics(state.diagnosticsLog),
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

        // Initialize MCP (Ticket 36)
        let mcpManager: any; // Type as any to avoid circular deps or complex imports for now
        let mcpTools: any[] = [];

        if (cfg.mcpEnabled) {
            try {
                const { McpManager } = await import('../../mcp/client.js');
                const { createMcpTools } = await import('../../tools/mcp.js');

                mcpManager = new McpManager(cfg);
                await mcpManager.initialize();
                mcpTools = await createMcpTools(mcpManager);
                log.info('MCP initialized', { toolCount: mcpTools.length });
            } catch (error: any) {
                log.error('Failed to initialize MCP', { error: error.message });
            }
        }

        // Define tools for the coder
        const tools = [
            ...mcpTools,
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

        // Tool execution loop
        const currentMessages = [...messages];
        let turns = 0;

        let commandCount = 0;
        let testCount = 0;
        let fileChanges = state.fileChanges || {};
        let functionalChecks = state.functionalChecks || [];
        let patchFingerprints = state.patchFingerprints || new Map<string, number>();
        let diagnosticRun = false;

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
                    } else if (toolCall.function.name === 'get_code_context') {
                        const { getCodeIndex } = await import('../../tools/code_index.js');
                        const index = getCodeIndex();

                        // Lazy build index on first use
                        if (!state.codeIndexBuilt) {
                            log.info('Building code index (first use)');
                            await index.build(cfg.rootDir!);
                            state.codeIndexBuilt = true;
                        }

                        // Update index with changed files
                        const changedFiles = Object.keys(fileChanges || {});
                        if (changedFiles.length > 0) {
                            await index.update(changedFiles);
                        }

                        // Query index
                        let snippets;
                        if (args.symbol) {
                            snippets = index.querySymbol(args.symbol);
                        } else if (args.file) {
                            snippets = index.queryFile(args.file);
                        } else {
                            snippets = [];
                        }

                        result = {
                            count: snippets.length,
                            snippets: snippets.slice(0, 10) // Limit to 10 results
                        };
                        log.info('Code context retrieved from index', {
                            symbol: args.symbol,
                            file: args.file,
                            count: snippets.length
                        });
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
                        // Patch deduplication (Ticket 19)
                        const fingerprint = crypto.createHash('sha256')
                            .update(`${args.path}:${args.diff}`)
                            .digest('hex')
                            .slice(0, 16);

                        const repeatCount = patchFingerprints.get(fingerprint) || 0;

                        if (repeatCount >= 2) {
                            result = `ERROR: Repeated identical patch on "${args.path}" (${repeatCount} times). This indicates no progress. Aborting patch application. Consider a different approach or escalate to planner.`;
                            log.warn('Repeated patch detected, aborting', {
                                path: args.path,
                                fingerprint,
                                count: repeatCount
                            });
                        } else {
                            patchFingerprints.set(fingerprint, repeatCount + 1);
                            await writePatch({ rootDir: cfg.rootDir! }, args.path, args.diff);
                            result = "Patch applied successfully.";
                            fileChanges = { ...(fileChanges || {}), [args.path]: 'patched' };
                            log.info('Patch applied', { path: args.path, fingerprint, repeatCount: repeatCount + 1 });
                        }
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

                                // Record functional probe if applicable (Ticket 28)
                                const probes = recordFunctionalProbe(commandStr, cmdResult, 'coder');
                                if (probes.length > 0) {
                                    // We need to merge this into state, but we are inside the tool loop.
                                    // We can accumulate them in a local variable and return them at the end.
                                    // However, coderNode returns Partial<AgentState>.
                                    // Let's add a local `functionalChecks` array to the node scope.
                                    functionalChecks = [...(functionalChecks || []), ...probes];
                                }

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
                    } else if (toolCall.function.name === 'run_diagnostic') {
                        const kind = typeof args.kind === 'string' ? args.kind : 'auto';

                        if (diagnosticRun && kind === 'auto') {
                            result = 'Diagnostic already executed in this coder run; reuse its output and focus on fixing the top errors.';
                            log.info('Diagnostic skipped (already run)');
                        } else {
                            const detected = await detectCommands(cfg);
                            let cmd: string | undefined;

                            if (kind === 'build') {
                                cmd = detected.buildCommand || detected.primaryTest || detected.lintCommand;
                            } else if (kind === 'test') {
                                cmd = detected.primaryTest || detected.buildCommand || detected.lintCommand;
                            } else if (kind === 'lint') {
                                cmd = detected.lintCommand || detected.primaryTest || detected.buildCommand;
                            } else {
                                cmd =
                                    detected.diagnosticCommand ||
                                    detected.primaryTest ||
                                    detected.buildCommand ||
                                    detected.lintCommand;
                            }

                            if (!cmd) {
                                result = {
                                    kind: 'diagnostic_unavailable',
                                    message:
                                        'No suitable diagnostic command (build/test/lint) was detected for this stack. Inspect the repo and choose a specific command with run_command or run_tests.',
                                    stack: detected.stack
                                };
                                log.info('No diagnostic command available', { detected });
                            } else if (isTinyTask && executionProfile !== 'strict') {
                                result = `Skipped diagnostic "${cmd}" because task scope is tiny under profile "${executionProfile}". Prefer minimal, targeted edits instead.`;
                                log.info('Diagnostic skipped by tiny-task policy', { command: cmd });
                            } else if (commandCount >= policy.maxCommands) {
                                result = `Skipped diagnostic: command budget exceeded for profile "${executionProfile}" (max ${policy.maxCommands}).`;
                                log.info('Diagnostic skipped by profile limit', { command: cmd });
                            } else {
                                commandCount += 1;
                                const cmdResult = await runCommand(cfg, cmd);
                                diagnosticRun = true;
                                result = {
                                    command: cmd,
                                    exitCode: cmdResult.exitCode,
                                    stdout: cmdResult.stdout,
                                    stderr: cmdResult.stderr,
                                    passed: cmdResult.passed
                                };
                                log.info('Diagnostic command executed', {
                                    command: cmd,
                                    exitCode: cmdResult.exitCode,
                                    passed: cmdResult.passed
                                });
                            }
                        }
                    } else if (toolCall.function.name === 'apply_edits') {
                        await applyEdits(args.path, args.edits);
                        result = `Successfully applied ${args.edits.length} edits to ${args.path}`;
                        fileChanges[args.path] = 'modified';
                    } else if (mcpManager && mcpTools.some(t => t.function.name === toolCall.function.name)) {
                        // Handle MCP tool call
                        const { executeMcpTool } = await import('../../tools/mcp.js');
                        result = await executeMcpTool(mcpManager, toolCall.function.name, args);
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

        if (mcpManager) {
            await mcpManager.closeAll();
        }

        return {
            fileChanges,
            messages: currentMessages.slice(messages.length),
            consecutiveNoOps,
            patchFingerprints,
            functionalChecks
        };
    };
}
