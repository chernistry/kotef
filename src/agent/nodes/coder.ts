import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';

import { loadPrompt } from '../../core/prompts.js';
import { callChat, ChatMessage } from '../../core/llm.js';
import { readFile, writePatch } from '../../tools/fs.js';

export function coderNode(cfg: KotefConfig, chatFn = callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const promptTemplate = await loadPrompt('coder');

        // Contextualize prompt
        const systemPrompt = promptTemplate
            .replace('{{ticket}}', state.sdd.ticket || 'No ticket provided');

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...state.messages,
            {
                role: 'user',
                content: `Implement the changes. You have access to file tools. 
        Current Plan: ${JSON.stringify(state.plan)}
        Research: ${JSON.stringify(state.researchResults)}`
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
                    name: 'write_patch',
                    description: 'Apply a unified diff patch to a file',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'Relative path to file' },
                            diff: { type: 'string', description: 'Unified diff content' }
                        },
                        required: ['path', 'diff']
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

        // Let's do a simple loop for max 5 turns.
        const currentMessages = [...messages];
        let turns = 0;
        const maxTurns = 5;
        let fileChanges = state.fileChanges || {};

        while (turns < maxTurns) {
            const response = await chatFn(cfg, currentMessages, {
                model: cfg.modelStrong, // Coder uses strong model
                tools: tools as any // Cast to avoid strict type mismatch if any
            });

            const msg = response.messages[response.messages.length - 1];
            currentMessages.push(msg);

            if (!msg.tool_calls || msg.tool_calls.length === 0) {
                // No more tools, we are done
                break;
            }

            // Execute tools
            for (const toolCall of msg.tool_calls) {
                const args = JSON.parse(toolCall.function.arguments);
                let result: any;

                try {
                    if (toolCall.function.name === 'read_file') {
                        result = await readFile(cfg, args.path);
                    } else if (toolCall.function.name === 'write_patch') {
                        await writePatch(cfg, args.path, args.diff);
                        result = "Patch applied successfully.";
                        // Record change
                        fileChanges = { ...fileChanges, [args.path]: 'patched' };
                    } else {
                        result = "Unknown tool";
                    }
                } catch (e: any) {
                    result = `Error: ${e.message}`;
                }

                currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }
            turns++;
        }

        return {
            fileChanges,
            messages: currentMessages.slice(messages.length) // Append new messages
        };
    };
}
