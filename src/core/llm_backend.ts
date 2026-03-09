import { CallChatResult, ChatCompletionOptions, ChatMessage } from './llm.js';
import { KotefConfig } from './config.js';

export interface AgentModelRuntime {
    callChat(
        config: KotefConfig,
        messages: ChatMessage[],
        options: ChatCompletionOptions
    ): Promise<CallChatResult>;
}

export async function createLlmBackend(config: KotefConfig): Promise<AgentModelRuntime> {
    if (config.modelRuntime === 'kiro' || config.llmProvider === 'kiro') {
        const { KiroConversationBackend } = await import('./kiro_conversation_backend.js');
        return new KiroConversationBackend();
    }

    if (config.modelRuntime === 'legacy') {
        const { LegacyChatRuntime } = await import('./legacy_chat_runtime.js');
        return new LegacyChatRuntime();
    }

    const { OpenAiResponsesRuntime } = await import('./openai_backend.js');
    return new OpenAiResponsesRuntime();
}
