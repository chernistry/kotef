import OpenAI from 'openai';
import type {
    Response,
    ResponseCreateParamsBase,
    ResponseFunctionToolCall,
    ResponseInputItem,
    ResponseOutputItem,
    ResponseStreamEvent
} from 'openai/resources/responses/responses';

import { KotefConfig } from './config.js';
import { AgentModelRuntime } from './llm_backend.js';
import { CallChatResult, ChatCompletionOptions, ChatMessage, ChatToolCall, KotefLlmError, ToolCallResult } from './llm.js';
import { safeParse } from '../utils/json.js';
import { LegacyChatRuntime } from './legacy_chat_runtime.js';

function toResponsesTools(tools: ChatCompletionOptions['tools']): ResponseCreateParamsBase['tools'] | undefined {
    if (!tools || tools.length === 0) {
        return undefined;
    }

    return tools
        .filter((tool): tool is { type: 'function'; function: { name: string; description?: string; parameters?: Record<string, unknown> } } => {
            return tool?.type === 'function' && typeof tool.function?.name === 'string';
        })
        .map(tool => ({
            type: 'function' as const,
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters ?? { type: 'object', properties: {} },
            strict: true,
        }));
}

function toToolChoice(toolChoice: ChatCompletionOptions['tool_choice']): ResponseCreateParamsBase['tool_choice'] | undefined {
    if (!toolChoice) {
        return undefined;
    }
    if (typeof toolChoice === 'string') {
        return toolChoice as ResponseCreateParamsBase['tool_choice'];
    }
    if (toolChoice.type === 'function' && toolChoice.function?.name) {
        return {
            type: 'function',
            name: toolChoice.function.name,
        };
    }
    return undefined;
}

function toResponsesInput(messages: ChatMessage[]): ResponseInputItem[] {
    const input: ResponseInputItem[] = [];

    for (const message of messages) {
        if (message.role === 'tool') {
            if (!message.tool_call_id) {
                continue;
            }
            input.push({
                type: 'function_call_output',
                call_id: message.tool_call_id,
                output: message.content ?? '',
            });
            continue;
        }

        if (message.role === 'assistant' && message.tool_calls?.length) {
            if (message.content) {
                input.push({
                    type: 'message',
                    role: 'assistant',
                    content: message.content,
                });
            }
            for (const toolCall of message.tool_calls) {
                input.push({
                    type: 'function_call',
                    call_id: toolCall.id,
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                });
            }
            continue;
        }

        input.push({
            type: 'message',
            role: message.role,
            content: message.content ?? '',
        });
    }

    return input;
}

function getAssistantText(output: ResponseOutputItem[], fallback: string): { text: string | null; refusal: string | null } {
    let refusal: string | null = null;

    for (const item of output) {
        if (item.type !== 'message') {
            continue;
        }
        const textParts = item.content
            .filter(part => part.type === 'output_text')
            .map(part => part.text);
        const refusalParts = item.content
            .filter(part => part.type === 'refusal')
            .map(part => part.refusal);

        if (textParts.length > 0) {
            return { text: textParts.join('\n'), refusal: refusalParts[0] ?? null };
        }
        if (refusalParts.length > 0) {
            refusal = refusalParts[0];
        }
    }

    return { text: fallback || null, refusal };
}

function extractToolCalls(output: ResponseOutputItem[]): { legacy: ChatToolCall[]; parsed: ToolCallResult[] } {
    const functionCalls = output.filter((item): item is ResponseFunctionToolCall => item.type === 'function_call');

    const legacy = functionCalls.map(call => ({
        id: call.call_id,
        type: 'function' as const,
        function: {
            name: call.name,
            arguments: call.arguments,
        },
    }));

    const parsed = functionCalls.map(call => {
        let args: unknown;
        try {
            args = safeParse(call.arguments, {});
        } catch {
            args = call.arguments;
        }

        return {
            toolName: call.name,
            args,
            result: undefined,
        };
    });

    return { legacy, parsed };
}

async function emitEvent(
    options: ChatCompletionOptions,
    event: ResponseStreamEvent | { type: string; payload: unknown }
): Promise<void> {
    if (!options.onEvent) {
        return;
    }
    if ('payload' in event) {
        await options.onEvent(event);
        return;
    }
    await options.onEvent({
        type: event.type,
        payload: event,
    });
}

export class OpenAiResponsesRuntime implements AgentModelRuntime {
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

        const model = options.model || (options.useStrongModel ? config.modelStrong : config.modelFast);
        const isOpenAiNativeEndpoint = config.baseUrl.includes('api.openai.com');
        const request: ResponseCreateParamsBase = {
            model,
            input: toResponsesInput(messages),
            tools: toResponsesTools(options.tools),
            tool_choice: toToolChoice(options.tool_choice),
            temperature: options.temperature ?? 0,
            max_output_tokens: options.maxTokens,
        };

        if (isOpenAiNativeEndpoint) {
            request.reasoning = {
                effort: config.reasoningEffort,
            };
        }

        if (config.structuredOutputs && options.response_format) {
            request.text = {
                format: { type: options.response_format.type },
            };
        }

        try {
            let response: Response;

            if (options.onEvent) {
                const stream = client.responses.stream({ ...request, stream: true }, { signal: options.signal });
                for await (const event of stream) {
                    await emitEvent(options, event);
                }
                response = await stream.finalResponse();
            } else {
                response = await client.responses.create(request, { signal: options.signal }) as Response;
            }

            const { text, refusal } = getAssistantText(response.output, response.output_text);
            const { legacy, parsed } = extractToolCalls(response.output);

            // Some OpenAI-compatible providers partially support Responses and may
            // return empty text without tool calls. Fall back to legacy chat once.
            if (!text && legacy.length === 0) {
                const fallback = new LegacyChatRuntime();
                return await fallback.callChat(config, messages, options);
            }

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: text,
                tool_calls: legacy.length > 0 ? legacy : undefined,
            };

            await emitEvent(options, {
                type: 'response.completed',
                payload: {
                    id: response.id,
                    usage: response.usage,
                },
            });

            return {
                messages: [...messages, assistantMessage],
                toolCalls: parsed.length > 0 ? parsed : undefined,
                responseId: response.id,
                usage: response.usage ? {
                    inputTokens: response.usage.input_tokens,
                    outputTokens: response.usage.output_tokens,
                    totalTokens: response.usage.total_tokens,
                } : undefined,
                refusal,
            };
        } catch (error) {
            if (error instanceof OpenAI.APIError) {
                throw new KotefLlmError(`OpenAI Responses API Error: ${error.message}`, error);
            }
            throw new KotefLlmError(`LLM Call Failed: ${(error as Error).message}`, error);
        }
    }
}
