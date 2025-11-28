/**
 * Kiro Executor: Wraps Kiro CLI as an Executor (Ticket 05)
 */

import type { KotefConfig } from '../../core/config.js';
import type { AgentState } from '../state.js';
import type { ExecutorRequest, ExecutorResult } from './types.js';
import { runKiroAgentSession } from '../../core/kiro_session.js';
import { loadRuntimePrompt } from '../../core/prompts.js';
import { createLogger } from '../../core/logger.js';
import { summarizeIntent } from '../utils/intent_contract.js';

const log = createLogger('kiro-executor');

/**
 * Build ExecutorRequest from AgentState
 */
export function buildExecutorRequest(state: AgentState, rootDir: string): ExecutorRequest {
    return {
        rootDir,
        intent: state.intentContract || null,
        ticketMarkdown: state.sdd?.ticket,
        summary: state.sdd?.goal,
        targetFiles: state.plan?.needs?.files,
        context: {
            architect: state.sdd?.architect?.split('\n').slice(0, 20).join('\n'),
            bestPractices: state.sdd?.bestPractices?.split('\n').slice(0, 15).join('\n'),
            projectSummary: state.projectSummary
                ? `Type: ${state.projectSummary.projectType}, Languages: ${state.projectSummary.languages.join(', ')}`
                : undefined
        }
    };
}

/**
 * Run Kiro as an executor
 */
export async function runKiroExecutor(
    cfg: KotefConfig,
    request: ExecutorRequest
): Promise<ExecutorResult> {
    log.info('Running Kiro executor', { rootDir: request.rootDir });

    // Load and build prompt
    const promptTemplate = await loadRuntimePrompt('kiro_coder');

    const goal = request.ticketMarkdown || request.summary || 'No goal specified';
    const architect = request.context?.architect || 'No architecture context';
    const practices = request.context?.bestPractices || 'No specific best practices';
    const projectSummary = request.context?.projectSummary || 'No project summary';

    let prompt = promptTemplate
        .replace('{{GOAL}}', goal)
        .replace('{{ARCHITECT}}', architect)
        .replace('{{BEST_PRACTICES}}', practices)
        .replace('{{PROJECT_SUMMARY}}', projectSummary);

    // Add intent contract if available
    if (request.intent) {
        const intentSummary = summarizeIntent(request.intent);
        prompt += `\n\n## Intent Contract\n${intentSummary}`;
    }

    try {
        const result = await runKiroAgentSession(cfg, {
            rootDir: request.rootDir,
            prompt,
            timeout: cfg.kiroSessionTimeout,
            trustAllTools: true
        });

        return {
            success: result.success,
            error: result.error,
            changedFiles: result.changedFiles,
            logs: result.stdout ? [result.stdout] : undefined
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
            changedFiles: []
        };
    }
}
