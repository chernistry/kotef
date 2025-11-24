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

// Assuming ChatCompletionResponse is OpenAI.Chat.Completions.ChatCompletion
type ChatCompletionResponse = OpenAI.Chat.Completions.ChatCompletion;

export async function callChat(
    config: KotefConfig,
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
): Promise<{ messages: ChatMessage[]; toolCalls?: ToolCallResult[] }> {
    if (config.mockMode) {
        // Simple mock logic based on system prompt or last message
        const systemMsg = messages.find(m => m.role === 'system')?.content || '';
        const lastMsg = messages[messages.length - 1].content || '';

        let content: string | null = null;
        let toolCalls: any[] = [];

        // Planner Mock
        if (systemMsg.includes('You are Kotef') || lastMsg.includes('You are Kotef')) {
            if (messages.some(m => m.content && m.content.includes('Add a subtract function'))) {
                content = JSON.stringify({ next: 'coder' });
            } else {
                content = JSON.stringify({ next: 'done' });
            }
        }
        // Coder Mock
        else if (systemMsg.includes('You are the Coder') || lastMsg.includes('You are the Coder')) {
            // Check if we already did the edit
            const hasEdit = messages.some(m => m.role === 'assistant' && m.tool_calls);
            if (!hasEdit) {
                content = null;
                toolCalls = [{
                    id: 'call_1',
                    type: 'function',
                    function: {
                        name: 'write_patch',
                        arguments: JSON.stringify({
                            path: 'src/index.ts',
                            diff: `--- src/index.ts
+++ src/index.ts
@@ -1,1 +1,5 @@
 console.log("Hello World");
+
+export function subtract(a: number, b: number): number {
+    return a - b;
+}`
                        })
                    }
                }];
            } else {
                content = "I have applied the changes.";
            }
        }
        // Bootstrap Architect Mock
        else if (systemMsg.includes('You are the Chief Architect') || lastMsg.includes('You are the Chief Architect')) {
            content = JSON.stringify({
                project_md: '# Mock Project',
                architect_md: '# Mock Architect',
                best_practices_md: '# Mock Best Practices'
            });
        }
        // Bootstrap Tickets Mock
        else if (systemMsg.includes('You are the Project Manager') || lastMsg.includes('You are the Project Manager')) {
            content = JSON.stringify({
                tickets: [{
                    filename: '01-mock-ticket.md',
                    content: '# Mock Ticket'
                }]
            });
        }
        // Deep Research Mock
        else if (systemMsg.includes('You are a research assistant') || lastMsg.includes('You are a research assistant')) {
            content = JSON.stringify([{
                statement: 'Mock finding',
                citations: [{ url: 'https://example.com/mock', title: 'Mock Source' }]
            }]);
        }
        else {
            if (options.response_format?.type === 'json_object') {
                content = "{}";
            } else {
                content = "Mock response";
            }
        }

        const assistantMessage: ChatMessage = {
            role: 'assistant',
            content,
            tool_calls: toolCalls
        };

        const resultMessages = [...messages, assistantMessage];
        const parsedToolCalls: ToolCallResult[] = toolCalls?.map(tc => ({
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments),
            result: undefined
        })) || [];

        return {
            messages: resultMessages,
            toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined
        };
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
