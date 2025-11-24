import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { deepResearch } from '../../tools/deep_research.js';

export function researcherNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        // In a real implementation, we'd parse the plan or messages to get the query.
        // For MVP stub, let's assume we research the goal if present.

        const query = state.sdd.goal || "Analyze project structure";

        // Only research if not already done (basic check)
        if (state.researchResults) {
            return {};
        }

        try {
            const findings = await deepResearch(cfg, query);
            return {
                researchResults: findings
            };
        } catch (error) {
            console.error("Research failed:", error);
            return {
                researchResults: { error: String(error) }
            };
        }
    };
}
