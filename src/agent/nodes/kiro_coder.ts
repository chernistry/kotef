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

    // Load prompt template
    const promptTemplate = await (await import('../../core/prompts.js')).loadRuntimePrompt('kiro_coder');

    // Build replacements
    const goal = state.sdd?.ticket ||
        state.messages.find(m => m.role === 'user')?.content ||
        'No goal specified';

    const architect = state.sdd?.architect
        ? state.sdd.architect.split('\n').slice(0, 20).join('\n')
        : 'No architecture context';

    const practices = state.sdd?.bestPractices
        ? state.sdd.bestPractices.split('\n').slice(0, 15).join('\n')
        : 'No specific best practices';

    let projectSummary = 'No project summary available';
    if (state.projectSummary) {
        const parts = [`- Project Type: ${state.projectSummary.projectType}`];
        if (state.projectSummary.languages.length > 0) {
            parts.push(`- Languages: ${state.projectSummary.languages.join(', ')}`);
        }
        if (state.projectSummary.frameworks.length > 0) {
            parts.push(`- Frameworks: ${state.projectSummary.frameworks.join(', ')}`);
        }
        projectSummary = parts.join('\n');
    }

    // Replace placeholders
    const prompt = promptTemplate
        .replace('{{GOAL}}', goal)
        .replace('{{ARCHITECT}}', architect)
        .replace('{{BEST_PRACTICES}}', practices)
        .replace('{{PROJECT_SUMMARY}}', projectSummary);

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
