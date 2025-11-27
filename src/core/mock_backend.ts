import { ChatMessage, ChatCompletionOptions, ToolCallResult } from './llm.js';

/**
 * Handles mock responses for testing and development.
 * Separated from the main backend to keep production code clean.
 */
export class MockLlmBackend {
    handleMockMode(
        messages: ChatMessage[],
        options: ChatCompletionOptions
    ): { messages: ChatMessage[]; toolCalls?: ToolCallResult[] } {
        const systemMsg = messages.find(m => m.role === 'system')?.content || '';
        const lastMsg = messages[messages.length - 1].content || '';

        let content: string | null = null;
        let toolCalls: any[] | undefined = undefined;

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
            const hasEdit = messages.some(m => m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0);
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
        else if (systemMsg.includes('software architect') || lastMsg.includes('software architect')) {
            content = JSON.stringify({
                project_md: '# Mock Project',
                architect_md: '# Mock Architect',
                best_practices_md: '# Mock Best Practices'
            });
        }
        // Bootstrap Tickets Mock
        else if (systemMsg.includes('Project Manager') || lastMsg.includes('Project Manager')) {
            content = JSON.stringify({
                tickets: [{
                    filename: '01-mock-ticket.md',
                    content: '# Mock Ticket'
                }]
            });
        }
        // Bootstrap Project MD Mock
        else if (systemMsg.includes('create a `project.md`') || systemMsg.includes('technical project manager')) {
            content = `# Project: Mock Project

## Goal
Build awesome software

## Tech Stack
TypeScript, Node.js

## Scope
MVP implementation

## Definition of Done
- [ ] Code works
- [ ] Tests pass`;
        }
        // Deep Research Mock
        else if (systemMsg.includes('research assistant') || lastMsg.includes('research assistant') || systemMsg.includes('software researcher')) {
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
}
