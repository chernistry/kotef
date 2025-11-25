import { KotefConfig } from './config.js';
import { LlmBackend, createLlmBackend } from './llm_backend.js';

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
    tools?: any[]; // OpenAI.Chat.Completions.ChatCompletionTool[]
    tool_choice?: any; // OpenAI.Chat.Completions.ChatCompletionToolChoiceOption
    response_format?: { type: 'json_object' | 'text' };
    /** If true, use the strong model (modelStrong) instead of default (modelFast) */
    useStrongModel?: boolean;
}

export class KotefLlmError extends Error {
    constructor(message: string, public cause?: unknown) {
        super(message);
        this.name = 'KotefLlmError';
    }
}

// Singleton backend instance (created lazily)
let _backend: LlmBackend | null = null;

/**
 * Main entry point for LLM chat completions.
 * Automatically selects the appropriate backend based on configuration.
 */
export async function callChat(
    config: KotefConfig,
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
): Promise<{ messages: ChatMessage[]; toolCalls?: ToolCallResult[] }> {
    // Create backend on first use
    if (!_backend) {
        _backend = await createLlmBackend(config);
    }

    // Delegate to the selected backend
    return _backend.callChat(config, messages, options);
}
