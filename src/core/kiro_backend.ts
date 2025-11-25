import { execa } from 'execa';
import { ChatMessage, ChatCompletionOptions, ToolCallResult, KotefLlmError } from './llm.js';
import { KotefConfig } from './config.js';
import { LlmBackend } from './llm_backend.js';

/**
 * Kiro CLI LLM backend using Claude Sonnet 4.5.
 * Spawns kiro-cli process for each completion request.
 */
export class KiroCliLlmBackend implements LlmBackend {
    async callChat(
        config: KotefConfig,
        messages: ChatMessage[],
        options: ChatCompletionOptions = {}
    ): Promise<{ messages: ChatMessage[]; toolCalls?: ToolCallResult[] }> {
        // Validate kiro-cli is configured
        const kiroPath = config.kiroCliPath || 'kiro-cli';
        const kiroModel = config.kiroModel || 'claude-sonnet-4.5';

        // Serialize messages into a single prompt
        const prompt = this.serializeMessages(messages);

        // Build kiro-cli command
        const args = [
            'chat',
            '--no-interactive',
            '--model', kiroModel,
        ];

        // If there's a specific agent/temperature in options, we could add them here
        // For now, we'll keep it simple and pass the prompt as the final argument
        args.push(prompt);

        try {
            // Execute kiro-cli with timeout
            const result = await execa(kiroPath, args, {
                timeout: options.maxTokens ? (options.maxTokens * 100) : 60000, // Rough timeout based on tokens
                reject: false, // Don't throw on non-zero exit, we'll handle it
                stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, capture stdout and stderr
            });

            // Handle non-zero exit codes
            if (result.exitCode !== 0) {
                const errorMsg = result.stderr || result.stdout || 'Unknown error';
                throw new KotefLlmError(
                    `kiro-cli failed with exit code ${result.exitCode}: ${errorMsg}`
                );
            }

            // Extract response from stdout
            const responseText = result.stdout.trim();

            if (!responseText) {
                throw new KotefLlmError('kiro-cli returned empty response');
            }

            // Create assistant message from response
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: responseText,
            };

            const resultMessages = [...messages, assistantMessage];

            // Note: Kiro CLI doesn't expose OpenAI-style tool calls in --no-interactive mode
            // We treat it as a text-only LLM, keeping tool orchestration on kotef side
            return {
                messages: resultMessages,
                toolCalls: undefined,
            };

        } catch (error) {
            // Handle specific error cases
            if ((error as any).code === 'ENOENT') {
                throw new KotefLlmError(
                    `kiro-cli not found at path: ${kiroPath}\n\n` +
                    `To use Kiro backend:\n` +
                    `  1. Install kiro-cli (formerly Amazon Q Developer CLI)\n` +
                    `  2. Set KIRO_CLI_PATH=/path/to/kiro-cli\n\n` +
                    `Or switch back to OpenAI:\n` +
                    `  CHAT_LLM_PROVIDER=openai`,
                    error
                );
            }

            if ((error as any).timedOut) {
                throw new KotefLlmError(
                    `kiro-cli timed out after ${(error as any).timeout}ms`,
                    error
                );
            }

            // Re-throw KotefLlmError as-is
            if (error instanceof KotefLlmError) {
                throw error;
            }

            // Wrap other errors
            throw new KotefLlmError(
                `kiro-cli execution failed: ${(error as Error).message}`,
                error
            );
        }
    }

    /**
     * Serialize ChatMessage array into a single prompt string for kiro-cli.
     * Format: SYSTEM: ...\n\nUSER: ...\n\nASSISTANT: ...
     */
    private serializeMessages(messages: ChatMessage[]): string {
        const parts: string[] = [];

        for (const msg of messages) {
            if (!msg.content) continue;

            const roleLabel = msg.role.toUpperCase();
            parts.push(`${roleLabel}: ${msg.content}`);
        }

        return parts.join('\n\n');
    }
}
