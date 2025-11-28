/**
 * Kiro Executor: Wraps Kiro CLI as an Executor (Ticket 05, 06)
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
 * Truncate text to max lines
 */
function truncateLines(text: string, maxLines: number): string {
    const lines = text.split('\n');
    return lines.length <= maxLines
        ? text
        : lines.slice(0, maxLines).join('\n') + '\n...[truncated]';
}

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
            architect: state.sdd?.architect ? truncateLines(state.sdd.architect, 20) : undefined,
            bestPractices: state.sdd?.bestPractices ? truncateLines(state.sdd.bestPractices, 15) : undefined,
            projectSummary: state.projectSummary
                ? `Type: ${state.projectSummary.projectType}, Languages: ${state.projectSummary.languages.join(', ')}`
                : undefined,
            riskSummary: state.riskMap
                ? `Risk level: ${state.riskMap.level}. Factors: ${state.riskMap.factors.join(', ')}.`
                : undefined,
            impactSummary: state.impactMap
                ? `Files/modules likely impacted: ${[...state.impactMap.files, ...state.impactMap.modules].slice(0, 10).join(', ')}`
                : undefined
        }
    };
}

/**
 * Check if any changed files violate forbidden paths
 */
export function checkForbiddenPaths(
    changedFiles: string[],
    forbiddenPaths: string[]
): string[] {
    if (!forbiddenPaths || forbiddenPaths.length === 0) return [];

    const violations: string[] = [];
    for (const file of changedFiles) {
        for (const forbidden of forbiddenPaths) {
            // Simple prefix/glob matching
            const pattern = forbidden.replace(/\*\*/g, '').replace(/\*/g, '');
            if (file.startsWith(pattern) || file.includes(pattern)) {
                violations.push(file);
                break;
            }
        }
    }
    return violations;
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
    const intentSummary = request.intent ? summarizeIntent(request.intent) : 'No explicit intent contract.';
    const riskSummary = request.context?.riskSummary || 'No explicit risk map.';
    const impactSummary = request.context?.impactSummary || 'No impact analysis available.';

    const prompt = promptTemplate
        .replace('{{GOAL}}', goal)
        .replace('{{ARCHITECT}}', architect)
        .replace('{{BEST_PRACTICES}}', practices)
        .replace('{{PROJECT_SUMMARY}}', projectSummary)
        .replace('{{INTENT_CONTRACT}}', intentSummary)
        .replace('{{RISK_SUMMARY}}', riskSummary)
        .replace('{{IMPACT_SUMMARY}}', impactSummary);

    try {
        const result = await runKiroAgentSession(cfg, {
            rootDir: request.rootDir,
            prompt,
            timeout: cfg.kiroSessionTimeout,
            trustAllTools: true
        });

        // Check for forbidden path violations (Ticket 06)
        const forbiddenPaths = request.intent?.forbiddenPaths || [];
        const violations = checkForbiddenPaths(result.changedFiles, forbiddenPaths);

        if (violations.length > 0) {
            const reason = `Kiro modified forbidden path(s): ${violations.join(', ')}`;
            log.warn('Forbidden path violation', { violations });
            return {
                success: false,
                error: reason,
                changedFiles: result.changedFiles,
                logs: result.stdout ? [result.stdout] : undefined
            };
        }

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
