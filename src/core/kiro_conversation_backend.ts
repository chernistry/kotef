import { execa } from 'execa';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { ChatMessage, ChatCompletionOptions, ToolCallResult, KotefLlmError } from './llm.js';
import { KotefConfig } from './config.js';
import { LlmBackend } from './llm_backend.js';

/**
 * Kiro CLI backend using directory-based conversation persistence.
 * 
 * Strategy:
 * 1. Each backend instance has a unique session directory
 * 2. Kiro automatically persists conversations per directory
 * 3. Use --resume flag for multi-turn conversations
 * 4. Parse stdout to extract responses (with ANSI stripping)
 * 
 * Prerequisites:
 * - Kiro CLI must be configured with:
 *   kiro-cli settings chat.greeting.enabled false
 *   kiro-cli settings chat.uiMode "compact"
 *   kiro-cli settings chat.disableMarkdownRendering true
 */
export class KiroConversationBackend implements LlmBackend {
    private sessionDir: string;
    private turnCount: number = 0;

    constructor() {
        // Create a unique session directory for this backend instance
        const sessionId = `kiro-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.sessionDir = path.join(os.tmpdir(), sessionId);
    }

    async callChat(
        config: KotefConfig,
        messages: ChatMessage[],
        options: ChatCompletionOptions = {}
    ): Promise<{ messages: ChatMessage[]; toolCalls?: ToolCallResult[] }> {
        const kiroPath = config.kiroCliPath || 'kiro-cli';
        const kiroModel = config.kiroModel || 'claude-sonnet-4.5';

        try {
            // Ensure session directory exists
            await fs.mkdir(this.sessionDir, { recursive: true });

            // Kiro CLI works with user messages. We need to consolidate the message history
            // into a single user prompt, handling system messages and conversation context.
            let userPrompt = '';

            // Find system message (if any) and user messages
            const systemMessages = messages.filter(m => m.role === 'system');
            const nonSystemMessages = messages.filter(m => m.role !== 'system');

            // If we have system messages, include them as context
            if (systemMessages.length > 0) {
                const systemContent = systemMessages.map(m => m.content).join('\n\n');
                userPrompt = systemContent;
            }

            // Get the last user message (or convert assistant messages to context)
            if (nonSystemMessages.length > 0) {
                const lastMsg = nonSystemMessages[nonSystemMessages.length - 1];

                if (lastMsg.role === 'user') {
                    // Append user message
                    if (userPrompt) userPrompt += '\n\n';
                    userPrompt += lastMsg.content || '';
                } else {
                    // If last message is assistant (shouldn't happen in typical flow),
                    // just use it as context
                    if (userPrompt) userPrompt += '\n\n';
                    userPrompt += lastMsg.content || '';
                }
            } else if (!userPrompt) {
                throw new KotefLlmError('No messages to send to Kiro CLI');
            }

            // Handle JSON mode: Kiro CLI doesn't support OpenAI's response_format parameter,
            // so we inject explicit JSON instructions into the prompt when JSON mode is requested
            if (options.response_format?.type === 'json_object') {
                userPrompt += '\n\nIMPORTANT: You MUST respond with ONLY valid JSON. Do not include markdown code fences, explanations, or any text outside the JSON object.';
            }


            // Build command arguments
            const args = [
                'chat',
                '--no-interactive',
                '--trust-all-tools',
                '--model', kiroModel
            ];

            // Add --resume flag for multi-turn conversations
            if (this.turnCount > 0) {
                args.push('--resume');
            }

            // Add the prompt as final argument
            args.push(userPrompt);

            // Run Kiro CLI
            const result = await execa(kiroPath, args, {
                cwd: this.sessionDir,
                timeout: options.maxTokens ? (options.maxTokens * 100) : 300000,
                reject: false,
                env: {
                    ...process.env,
                    NO_COLOR: '1',
                    FORCE_COLOR: '0',
                }
            });

            // Increment turn counter
            this.turnCount++;

            // Get stdout
            const rawOutput = result.stdout?.trim() || '';
            const rawError = result.stderr?.trim() || '';

            if (!rawOutput && !rawError) {
                throw new KotefLlmError(
                    `kiro-cli returned no output (exit code: ${result.exitCode})`
                );
            }

            // Handle non-zero exit codes
            if (result.exitCode && result.exitCode !== 0) {
                throw new KotefLlmError(
                    `kiro-cli failed with exit code ${result.exitCode}: ${rawError || rawOutput}`
                );
            }

            // Strip ANSI codes
            const cleanOutput = this.stripAnsiCodes(rawOutput);

            // Extract response (skip UI chrome)
            const responseText = this.extractResponse(cleanOutput);

            if (!responseText || responseText.length === 0) {
                const debugOutput = rawOutput.substring(0, 500);
                throw new KotefLlmError(
                    `kiro-cli did not return LLM response content.\\n` +
                    `Exit code: ${result.exitCode}\\n` +
                    `Output preview: ${debugOutput}...`
                );
            }

            // Create assistant message
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: responseText
            };

            return {
                messages: [...messages, assistantMessage],
                toolCalls: undefined
            };

        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                throw new KotefLlmError(
                    `kiro-cli not found at path: ${kiroPath}\\n\\n` +
                    `To use Kiro backend:\\n` +
                    `  1. Install kiro-cli\\n` +
                    `  2. Set KIRO_CLI_PATH=/path/to/kiro-cli\\n` +
                    `  3. Configure settings (see docs)\\n\\n` +
                    `Or switch to OpenAI: CHAT_LLM_PROVIDER=openai`,
                    error
                );
            }

            if ((error as any).timedOut) {
                throw new KotefLlmError(
                    `kiro-cli timed out after ${(error as any).timeout}ms`,
                    error
                );
            }

            if (error instanceof KotefLlmError) {
                throw error;
            }

            throw new KotefLlmError(
                `kiro-cli execution failed: ${(error as Error).message}`,
                error
            );
        }
    }

    /**
     * Strip ANSI color codes from text
     */
    private stripAnsiCodes(text: string): string {
        // eslint-disable-next-line no-control-regex
        return text.replace(/\x1b\[[0-9;]*m/g, '');
    }

    /**
     * Extract actual LLM response from Kiro CLI output.
     * Skips welcome messages, model info, prompt markers, and statistics.
     */
    private extractResponse(cleanText: string): string {
        // This implementation is kept as is because the provided "Code Edit" was identical to the existing code.
        // If the intention was to introduce a new `extractJson` utility or modify this method to use it,
        // the specific changes for that were not provided in the "Code Edit" block.
        const lines = cleanText.split('\n');
        const responseLines: string[] = [];

        for (const line of lines) {
            // Skip metadata lines
            if (line.includes('Model:') ||
                line.includes('Plan:') ||
                line.includes('Credits:') ||
                line.includes('Time:') ||
                line.includes('💡') ||
                line.includes('Use /model')) {
                continue;
            }

            // Handle lines with prompt markers ("> text")
            // Extract the text AFTER the marker
            if (line.trim().startsWith('> ')) {
                const content = line.trim().substring(2).trim();
                if (content) {
                    responseLines.push(content);
                }
                continue;
            }

            // Skip commands (lines starting with /)
            if (line.trim().startsWith('/')) {
                continue;
            }

            // Collect all other non-empty lines
            if (line.trim().length > 0) {
                responseLines.push(line);
            }
        }

        return responseLines.join('\n').trim();
    }

    /**
     * Clean up session directory
     */
    async cleanup(): Promise<void> {
        try {
            await fs.rm(this.sessionDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    }
}
