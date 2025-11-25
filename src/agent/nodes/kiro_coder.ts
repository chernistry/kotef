import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { runKiroAgentSession } from '../../core/kiro_session.js';
import { createLogger } from '../../core/logger.js';

/**
 * Kiro Coder Node - delegates file editing to Kiro CLI's agentic coder.
 * Kotef's brain (SDD, planning, verification) remains in control.
 */
export async function kiroCoderNode(
    state: AgentState,
    config: KotefConfig
): Promise<Partial<AgentState>> {
    const log = createLogger('kiro-coder');
    log.info('Kiro coder node started');

    // Build handoff prompt from SDD context
    const prompt = buildHandoffPrompt(state, config);

    log.info('Running Kiro agent session', {
        rootDir: config.rootDir,
        timeout: config.kiroSessionTimeout
    });

    try {
        // Run Kiro CLI agent session
        const result = await runKiroAgentSession(config, {
            rootDir: config.rootDir,
            prompt,
            timeout: config.kiroSessionTimeout,
            trustAllTools: true,
        });

        // Log session results
        log.info('Kiro session completed', {
            success: result.success,
            changedFiles: result.changedFiles.length,
            error: result.error,
        });

        if (!result.success) {
            log.warn('Kiro session failed', { error: result.error });
            return {
                terminalStatus: 'aborted_constraint',
                plan: {
                    ...state.plan,
                    reason: result.error || 'Kiro session failed',
                },
            };
        }

        // Update file changes in state
        const updatedFileChanges = { ...state.fileChanges };
        for (const file of result.changedFiles) {
            // fileChanges values can be string or number
            updatedFileChanges[file] = 1; // Mark as changed
        }

        log.info('Kiro coder completed', { filesChanged: result.changedFiles.length });

        return {
            fileChanges: updatedFileChanges,
            messages: [
                ...state.messages,
                {
                    role: 'assistant',
                    content: `Kiro agent modified ${result.changedFiles.length} file(s): ${result.changedFiles.join(', ')}`,
                },
            ],
        };

    } catch (error) {
        log.error('Kiro session error', { error: (error as Error).message });

        return {
            terminalStatus: 'aborted_constraint',
            plan: {
                ...state.plan,
                reason: `Kiro session error: ${(error as Error).message}`,
            },
        };
    }
}

/**
 * Build handoff prompt from SDD context and agent state.
 */
function buildHandoffPrompt(state: AgentState, config: KotefConfig): string {
    const parts: string[] = [];

    // Header
    parts.push('# Coding Task');
    parts.push('');

    // Goal from ticket or latest message
    if (state.sdd?.ticket) {
        parts.push('## Goal');
        parts.push(state.sdd.ticket);
        parts.push('');
    } else if (state.messages.length > 0) {
        const userMsg = state.messages.find(m => m.role === 'user');
        if (userMsg?.content) {
            parts.push('## Goal');
            parts.push(userMsg.content);
            parts.push('');
        }
    }

    // Architecture context
    if (state.sdd?.architect) {
        parts.push('## Architecture Context');
        // Extract key points (first 500 chars to keep prompt concise)
        const architectSummary = state.sdd.architect
            .split('\n')
            .slice(0, 20)
            .join('\n');
        parts.push(architectSummary);
        parts.push('');
    }

    // Best practices
    if (state.sdd?.bestPractices) {
        parts.push('## Best Practices');
        // Extract key points
        const practicesSummary = state.sdd.bestPractices
            .split('\n')
            .slice(0, 15)
            .join('\n');
        parts.push(practicesSummary);
        parts.push('');
    }

    // Current state
    parts.push('## Current State');
    if (state.projectSummary) {
        parts.push(`- Project Type: ${state.projectSummary.projectType}`);
        if (state.projectSummary.languages.length > 0) {
            parts.push(`- Languages: ${state.projectSummary.languages.join(', ')}`);
        }
        if (state.projectSummary.frameworks.length > 0) {
            parts.push(`- Frameworks: ${state.projectSummary.frameworks.join(', ')}`);
        }
    }
    parts.push('');

    // Constraints
    parts.push('## Constraints');
    parts.push('- Use diff-first approach when modifying files');
    parts.push('- Preserve existing architecture and patterns');
    parts.push('- Write clean, maintainable code');
    parts.push('- Add tests if appropriate');
    parts.push('');

    // Instructions
    parts.push('## Instructions');
    parts.push('Implement the requested changes following the architecture and best practices above.');
    parts.push('Make all necessary file modifications to complete the task.');
    parts.push('');

    return parts.join('\n');
}
