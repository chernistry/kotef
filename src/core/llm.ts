import OpenAI from 'openai';
import { KotefConfig } from './config.js';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_call_id?: string;
    name?: string;
    tool_calls?: any[]; // OpenAI tool calls structure
}

export interface ToolCallResult {
    toolName: string;
    args: unknown;
    result: unknown;
}

export interface ChatCompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
    tool_choice?: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
    /** If true, use the strong model (modelStrong) instead of default (modelFast) */
    useStrongModel?: boolean;
}

export class KotefLlmError extends Error {
    constructor(message: string, public cause?: unknown) {
        super(message);
        this.name = 'KotefLlmError';
    }
}

export async function callChat(
    cfg: KotefConfig,
    messages: ChatMessage[],
    options: ChatCompletionOptions = {},
): Promise<{ messages: ChatMessage[]; toolCalls?: ToolCallResult[] }> {
    const openai = new OpenAI({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseUrl,
        timeout: 30000, // 30s timeout
        maxRetries: 3,
    });

    try {
        const model = options.model || (options.useStrongModel ? cfg.modelStrong : cfg.modelFast);

        const response = await openai.chat.completions.create({
            model,
            messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            temperature: options.temperature ?? 0,
            max_tokens: options.maxTokens,
            tools: options.tools,
            tool_choice: options.tool_choice,
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

        const toolCalls: ToolCallResult[] = message.tool_calls?.map(tc => ({
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments),
            result: undefined // Result is not known yet
        })) || [];

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
