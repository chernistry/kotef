import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { deepResearch } from '../../tools/deep_research.js';
import { createLogger } from '../../core/logger.js';
import { buildResearchQuery, loadProjectMetadata } from '../graphs/sdd_orchestrator.js';

export function researcherNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('researcher');
        log.info('Researcher node started');

        // If SDD already provides best practices, treat them as primary research source
        // and avoid hitting the web again unless we explicitly carry over prior findings.
        const sddBest = state.sdd.bestPractices || '';
        if (sddBest.trim().length > 0) {
            log.info('Existing SDD best_practices.md detected; skipping external deep research.');
            return {
                researchResults: {
                    source: 'sdd',
                    note: 'Using .sdd/best_practices.md as primary best-practices reference; no fresh web research performed in this run.'
                }
            };
        }

        // Only research if not already done (check if results exist and are non-empty)
        const hasResults =
            state.researchResults &&
            (Array.isArray(state.researchResults)
                ? state.researchResults.length > 0
                : Object.keys(state.researchResults).length > 0);

        if (hasResults) {
            log.info('Research already done, skipping', {
                resultsCount: Array.isArray(state.researchResults)
                    ? state.researchResults.length
                    : Object.keys(state.researchResults).length
            });
            return {};
        }

        // Build a goal-aware, LLM-optimized query if possible
        const goalFromSdd = state.sdd.goal;
        const goalFromMessages =
            state.messages.find(m => m.role === 'user' && typeof m.content === 'string')?.content || '';
        const baseGoal = goalFromSdd || goalFromMessages || 'Analyze project structure';

        let query = baseGoal;
        try {
            const metadata = await loadProjectMetadata(cfg.rootDir, baseGoal);
            query = await buildResearchQuery(cfg, baseGoal, metadata);
            log.info('Starting deep research', { query, originalGoal: baseGoal });
        } catch (error) {
            log.warn('Failed to build optimized research query; falling back to raw goal', {
                error: String(error),
            });
            log.info('Starting deep research', { query: baseGoal });
            query = baseGoal;
        }

        try {
            const findings = await deepResearch(cfg, query, {
                originalGoal: baseGoal,
                maxAttempts: 3,
            });
            log.info('Research completed', { findingsCount: findings ? findings.length : 0 });
            return {
                researchResults: findings
            };
        } catch (error) {
            log.error('Research failed', { error });
            return {
                researchResults: { error: String(error) }
            };
        }
    };
}
