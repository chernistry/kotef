import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { deepResearch } from '../../tools/deep_research.js';
import { createLogger } from '../../core/logger.js';

export function researcherNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('researcher');
        log.info('Researcher node started');
        
        // In a real implementation, we'd parse the plan or messages to get the query.
        // For MVP stub, let's assume we research the goal if present.

        const query = state.sdd.goal || "Analyze project structure";

        // Only research if not already done (basic check)
        if (state.researchResults) {
            log.info('Research already done, skipping');
            return {};
        }

        log.info('Starting deep research', { query });
        
        try {
            const findings = await deepResearch(cfg, query);
            log.info('Research completed', { findingsCount: findings ? Object.keys(findings).length : 0 });
            return {
                researchResults: findings
            };
        } catch (error) {
            log.error("Research failed", { error });
            return {
                researchResults: { error: String(error) }
            };
        }
    };
}
