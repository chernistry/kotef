import { ChatMessage, ChatCompletionOptions, ToolCallResult } from './llm.js';
import { KotefConfig } from './config.js';

/**
 * Abstract interface for LLM backends.
 * Allows pluggable providers (OpenAI, Kiro CLI, etc.)
 */
export interface LlmBackend {
    callChat(
        config: KotefConfig,
        messages: ChatMessage[],
        options: ChatCompletionOptions
    ): Promise<{ messages: ChatMessage[]; toolCalls?: ToolCallResult[] }>;
}

/**
 * Factory function to create the appropriate LLM backend based on configuration.
 */
export async function createLlmBackend(config: KotefConfig): Promise<LlmBackend> {
    const provider = config.llmProvider || 'openai';

    if (provider === 'kiro') {
        // Use conversation-based Kiro backend
        const { KiroConversationBackend } = await import('./kiro_conversation_backend.js');
        return new KiroConversationBackend();
    }

    // Default to OpenAI
    const { OpenAiLlmBackend } = await import('./openai_backend.js');
    return new OpenAiLlmBackend();
}
