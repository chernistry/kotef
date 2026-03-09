import { KotefConfig } from './config.js';
import { AgentModelRuntime, createLlmBackend } from './llm_backend.js';

export interface ChatToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_call_id?: string;
    name?: string;
    tool_calls?: ChatToolCall[];
}

export interface ToolCallResult {
    toolName: string;
    args: unknown;
    result: unknown;
}

export interface ModelRuntimeEvent {
    type: string;
    payload: unknown;
}

export interface ChatCompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    tools?: any[];
    tool_choice?: any;
    response_format?: { type: 'json_object' | 'text' };
    useStrongModel?: boolean;
    onEvent?: (event: ModelRuntimeEvent) => Promise<void> | void;
}

export interface CallChatResult {
    messages: ChatMessage[];
    toolCalls?: ToolCallResult[];
    responseId?: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
    };
    refusal?: string | null;
}

export class KotefLlmError extends Error {
    constructor(message: string, public cause?: unknown) {
        super(message);
        this.name = 'KotefLlmError';
    }
}

let backendCache: { key: string; runtime: AgentModelRuntime } | null = null;

function getBackendCacheKey(config: KotefConfig): string {
    return JSON.stringify({
        provider: config.llmProvider,
        runtime: config.modelRuntime,
        baseUrl: config.baseUrl,
        modelFast: config.modelFast,
        modelStrong: config.modelStrong,
        mockMode: config.mockMode,
    });
}

export function resetLlmBackend(): void {
    backendCache = null;
}

export async function callChat(
    config: KotefConfig,
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
): Promise<CallChatResult> {
    const cacheKey = getBackendCacheKey(config);
    if (!backendCache || backendCache.key !== cacheKey) {
        backendCache = {
            key: cacheKey,
            runtime: await createLlmBackend(config),
        };
    }
    return backendCache.runtime.callChat(config, messages, options);
}
