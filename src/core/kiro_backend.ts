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
            // Execute kiro-cli with timeout and NO_COLOR environment variable
            const result = await execa(kiroPath, args, {
                timeout: options.maxTokens ? (options.maxTokens * 100) : 60000, // Rough timeout based on tokens
                reject: false, // Don't throw on non-zero exit, we'll handle it
                stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, capture stdout and stderr
                env: {
                    ...process.env,
                    NO_COLOR: '1', // Attempt to disable color output
                    FORCE_COLOR: '0', // Also try this one
                },
            });

            // Extract response from stdout and strip ANSI codes first
            let rawOutput = result.stdout?.trim() || '';
            const rawError = result.stderr?.trim() || '';

            if (!rawOutput && !rawError) {
                throw new KotefLlmError(
                    `kiro-cli returned no output (exit code: ${result.exitCode})`
                );
            }

            // Strip ANSI color codes
            const cleanOutput = this.stripAnsiCodes(rawOutput);

            // Extract actual response (skip welcome messages, stats, etc.)
            const responseText = this.extractResponse(cleanOutput);

            // Check if we got a meaningful response (not just UI chrome)
            if (!responseText || responseText.length === 0) {
                // Log the raw output for debugging
                const debugOutput = rawOutput.substring(0, 500);
                throw new KotefLlmError(
                    `kiro-cli did not return any LLM response content.\n` +
                    `Exit code: ${result.exitCode}\n` +
                    `This usually means --no-interactive mode is not working properly.\n` +
                    `Output preview: ${debugOutput}...`
                );
            }

            // Handle non-zero exit codes AFTER checking for content
            // (Kiro might return undefined exitCode even on success)
            if (result.exitCode && result.exitCode !== 0) {
                const errorMsg = rawError || cleanOutput || 'Unknown error';
                throw new KotefLlmError(
                    `kiro-cli failed with exit code ${result.exitCode}: ${errorMsg}`
                );
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

    /**
     * Strip ANSI color codes from text.
     */
    private stripAnsiCodes(text: string): string {
        return text.replace(/\x1b\[[0-9;]*m/g, '');
    }

    /**
     * Extract actual response from kiro-cli output (skip headers/footers).
     * Kiro CLI adds welcome messages, model info, and statistics around the actual response.
     * 
     * Example output format:
     * ```
     * Welcome to Kiro!
     * 💡 Use /model to select the model...
     * Model: claude-sonnet-4.5 (/model to change) | Plan: KIRO FREE
     * 
     * > json
     * {"response": "here"}
     * 
     *  ▸ Credits: 0.07 • Time: 4s
     * ```
     */
    private extractResponse(text: string): string {
        const lines = text.split('\n');
        const responseLines: string[] = [];
        let inResponse = false;

        for (const line of lines) {
            // Skip welcome messages and metadata
            if (line.includes('Welcome to Kiro') ||
                line.includes('Model:') ||
                line.includes('Plan:') ||
                line.includes('▸ Credits:') ||
                line.includes('💡') ||
                line.trim().startsWith('/') ||
                line.includes('Use /model')) {
                continue;
            }

            // Skip prompt markers (e.g., "> json")
            if (line.trim() === '>' || line.trim().startsWith('> ')) {
                inResponse = true;
                continue;
            }

            // Stop at statistics line
            if (line.includes('Credits:') || line.includes('Time:')) {
                break;
            }

            // Collect actual response lines
            if (inResponse || line.trim().length > 0) {
                inResponse = true;
                responseLines.push(line);
            }
        }

        return responseLines.join('\n').trim();
    }
}
