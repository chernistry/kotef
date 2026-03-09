import OpenAI from 'openai';

import { KotefConfig } from './config.js';
import { AgentModelRuntime } from './llm_backend.js';
import { CallChatResult, ChatCompletionOptions, ChatMessage, ChatToolCall, KotefLlmError, ToolCallResult } from './llm.js';
import { safeParse } from '../utils/json.js';

function isFunctionToolCall(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall
): toolCall is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall {
    return toolCall.type === 'function';
}

export class LegacyChatRuntime implements AgentModelRuntime {
    async callChat(
        config: KotefConfig,
        messages: ChatMessage[],
        options: ChatCompletionOptions = {}
    ): Promise<CallChatResult> {
        if (config.mockMode) {
            const { MockLlmBackend } = await import('./mock_backend.js');
            return new MockLlmBackend().handleMockMode(messages, options);
        }

        if (!config.apiKey) {
            throw new KotefLlmError('OpenAI API key is not configured.');
        }

        const client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
            timeout: 30000,
            maxRetries: 3,
        });

        try {
            const model = options.model || (options.useStrongModel ? config.modelStrong : config.modelFast);
            const response = await client.chat.completions.create({
                model,
                messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                temperature: options.temperature ?? 0,
                max_tokens: options.maxTokens,
                tools: options.tools,
                tool_choice: options.tool_choice,
                response_format: options.response_format,
                reasoning_effort: config.reasoningEffort,
            }, { signal: options.signal });

            const choice = response.choices[0];
            if (!choice) {
                throw new KotefLlmError('No completion choices returned');
            }

            const legacyToolCalls: ChatToolCall[] = [];
            const parsedToolCalls: ToolCallResult[] = [];

            for (const toolCall of choice.message.tool_calls ?? []) {
                if (!isFunctionToolCall(toolCall)) {
                    continue;
                }

                legacyToolCalls.push({
                    id: toolCall.id,
                    type: 'function',
                    function: {
                        name: toolCall.function.name,
                        arguments: toolCall.function.arguments,
                    },
                });

                let args: unknown;
                try {
                    args = safeParse(toolCall.function.arguments, {});
                } catch {
                    args = toolCall.function.arguments;
                }

                parsedToolCalls.push({
                    toolName: toolCall.function.name,
                    args,
                    result: undefined,
                });
            }

            return {
                messages: [
                    ...messages,
                    {
                        role: 'assistant',
                        content: choice.message.content,
                        tool_calls: legacyToolCalls.length > 0 ? legacyToolCalls : undefined,
                    },
                ],
                toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined,
                usage: response.usage ? {
                    inputTokens: response.usage.prompt_tokens,
                    outputTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens,
                } : undefined,
            };
        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                throw new KotefLlmError(`OpenAI Chat API Error: ${error.message}`, error);
            }
            throw new KotefLlmError(`Legacy chat call failed: ${(error as Error).message}`, error);
        }
    }
}
