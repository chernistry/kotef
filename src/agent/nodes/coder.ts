import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { loadRuntimePrompt } from '../../core/prompts.js';
import { callChat, ChatMessage } from '../../core/llm.js';
import { resolveExecutionProfile, PROFILE_POLICIES, ExecutionProfile } from '../profiles.js';
import { safeParse } from '../../utils/json.js';
import { CODER_TOOLS } from '../tools/definitions.js';
import { ToolHandlers, ToolContext } from '../tools/handlers.js';

export function coderNode(cfg: KotefConfig, chatFn = callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('coder');
        log.info('Coder node started', { taskScope: state.taskScope });

        const isTinyTask = state.taskScope === 'tiny';
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
            const strictSignals = ['--cov', 'coverage', 'mypy', 'pylint', 'black', 'lint', 'pre-commit'];
            const hasStrictSignal = strictSignals.some(sig => architectText.includes(sig));
            return hasStrictSignal ? 'strict' : 'fast';
        };

        const executionProfile = inferProfile();
        const policy = PROFILE_POLICIES[executionProfile];
        const profileTurns: Record<ExecutionProfile, number> = { strict: 20, fast: 12, smoke: 6, yolo: 500 };
        const profileDefault = profileTurns[executionProfile] ?? 20;
        const configuredMax = cfg.maxCoderTurns && cfg.maxCoderTurns > 0 ? cfg.maxCoderTurns : 0;
        const effectiveConfigured = configuredMax > 0 ? Math.min(configuredMax, 500) : 0;
        const maxTurns = effectiveConfigured > 0 ? effectiveConfigured : profileDefault;

        log.info('Coder turn budget', { executionProfile, maxTurns });

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

        if (state.sddSummaries) {
            systemPrompt = systemPrompt.replaceAll('{{SDD_PROJECT}}', state.sddSummaries.projectSummary);
            systemPrompt = systemPrompt.replaceAll('{{SDD_ARCHITECT}}', state.sddSummaries.architectSummary);
            systemPrompt = systemPrompt.replaceAll('{{SDD_BEST_PRACTICES}}', state.sddSummaries.bestPracticesSummary);
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...state.messages,
            { role: 'user', content: `Implement the ticket with minimal diffs. Plan: ${safe(state.plan)}` }
        ];

        // Initialize MCP
        let mcpManager: any;
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

        const tools = [...mcpTools, ...CODER_TOOLS];

        // Execution Loop
        const currentMessages = [...messages];
        let turns = 0;

        // Tool Context
        let ctx: ToolContext = {
            cfg,
            state,
            executionProfile,
            isTinyTask,
            fileChanges: (state.fileChanges || {}) as Record<string, string>,
            patchFingerprints: state.patchFingerprints || new Map<string, number>(),
            functionalChecks: state.functionalChecks || [],
            commandCount: 0,
            testCount: 0,
            diagnosticRun: false
        };

        const trimHistory = (all: ChatMessage[]): ChatMessage[] => {
            if (all.length <= 30) return all;
            return [all[0], ...all.slice(1).slice(-20)];
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
                const args = safeParse(toolCall.function.arguments, {}) as any;
                let result: any;

                log.info('Executing tool', { tool: toolCall.function.name, args });

                try {
                    const handler = ToolHandlers[toolCall.function.name];
                    if (handler) {
                        const toolOutput = await handler(args, ctx);
                        result = toolOutput.result;
                        // Update context
                        ctx = { ...ctx, ...toolOutput.contextUpdates };
                    } else if (mcpManager && mcpTools.some(t => t.function.name === toolCall.function.name)) {
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
        const finalFileCount = Object.keys(ctx.fileChanges).length;
        const hasNewChanges = finalFileCount > initialFileCount;
        const consecutiveNoOps = hasNewChanges ? 0 : (state.consecutiveNoOps || 0) + 1;

        log.info('Coder node completed', { turns, filesChanged: finalFileCount });

        if (mcpManager) {
            await mcpManager.closeAll();
        }

        return {
            fileChanges: ctx.fileChanges,
            messages: currentMessages.slice(messages.length),
            consecutiveNoOps,
            patchFingerprints: ctx.patchFingerprints,
            functionalChecks: ctx.functionalChecks
        };
    };
}
