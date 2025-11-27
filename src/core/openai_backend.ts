import OpenAI from 'openai';
import { ChatMessage, ChatCompletionOptions, ToolCallResult, KotefLlmError } from './llm.js';
import { KotefConfig } from './config.js';
import { LlmBackend } from './llm_backend.js';
import { safeParse } from '../utils/json.js';

/**
 * OpenAI-compatible LLM backend.
 * Supports OpenAI API and compatible providers (OpenRouter, etc.)
 */
export class OpenAiLlmBackend implements LlmBackend {
    async callChat(
        config: KotefConfig,
        messages: ChatMessage[],
        options: ChatCompletionOptions = {}
    ): Promise<{ messages: ChatMessage[]; toolCalls?: ToolCallResult[] }> {
        // Mock mode handling
        // Mock mode handling
        if (config.mockMode) {
            const { MockLlmBackend } = await import('./mock_backend.js');
            return new MockLlmBackend().handleMockMode(messages, options);
        }

        if (!config.apiKey) {
            throw new KotefLlmError('OpenAI API key is not configured.');
        }

        const openai = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
            timeout: 30000, // 30s timeout
            maxRetries: 3,
        });

        try {
            const model = options.model || (options.useStrongModel ? config.modelStrong : config.modelFast);

            const response = await openai.chat.completions.create({
                model,
                messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                temperature: options.temperature ?? 0,
                max_tokens: options.maxTokens,
                tools: options.tools,
                tool_choice: options.tool_choice,
                response_format: options.response_format,
            }, { signal: options.signal });

            const choice = response.choices[0];
            if (!choice) {
                throw new KotefLlmError('No completion choices returned');
            }

            const message = choice.message;
            const resultMessages: ChatMessage[] = [...messages];

            // Convert OpenAI message to our ChatMessage
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: message.content,
            };

            // Handle tool calls if present
            if (message.tool_calls) {
                assistantMessage.tool_calls = message.tool_calls;
            }

            resultMessages.push(assistantMessage);

            const toolCalls: ToolCallResult[] = message.tool_calls?.map(tc => {
                let parsedArgs: unknown;
                const rawArgs = tc.function.arguments;
                try {
                    parsedArgs = typeof rawArgs === 'string' ? safeParse(rawArgs, {}) : rawArgs;
                } catch {
                    // If arguments are not valid JSON even after repair, pass through the raw string.
                    parsedArgs = rawArgs;
                }
                return {
                    toolName: tc.function.name,
                    args: parsedArgs,
                    result: undefined // Result is not known yet
                };
            }) || [];

            return {
                messages: resultMessages,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            };

        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                throw new KotefLlmError(`OpenAI API Error: ${error.message}`, error);
            }
            throw new KotefLlmError(`LLM Call Failed: ${(error as Error).message}`, error);
        }
    }

}
