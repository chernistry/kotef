import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { deepResearch } from '../../tools/deep_research.js';
import { createLogger } from '../../core/logger.js';

export function researcherNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('researcher');
        log.info('Researcher node started');

        const safe = (value: unknown) => {
            if (value === undefined || value === null) return '';
            if (typeof value === 'string') return value;
            return JSON.stringify(value, null, 2);
        };

        // If SDD already provides best practices, treat them as primary research source
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

        // Only research if not already done
        const hasResults =
            state.researchResults &&
            (Array.isArray(state.researchResults)
                ? state.researchResults.length > 0
                : Object.keys(state.researchResults).length > 0);

        if (hasResults) {
            log.info('Research already done, skipping');
            return {};
        }

        // Load prompt
        const { loadRuntimePrompt } = await import('../../core/prompts.js');
        const promptTemplate = await loadRuntimePrompt('researcher');

        const replacements: Record<string, string> = {
            '{{GOAL}}': safe(state.sdd.goal),
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{SDD_BEST_PRACTICES}}': safe(state.sdd.bestPractices),
            '{{RESEARCH_NEEDS}}': safe(state.plan?.needs?.research_queries),
            '{{EXECUTION_PROFILE}}': state.runProfile || 'fast',
            '{{TASK_SCOPE}}': state.taskScope || 'normal'
        };

        let systemPrompt = promptTemplate;
        for (const [token, value] of Object.entries(replacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...state.messages,
            {
                role: 'user',
                content: 'Plan the research. Output JSON.'
            }
        ];

        let plan: any;
        try {
            const { callChat } = await import('../../core/llm.js');
            const response = await callChat(cfg, messages as any, {
                model: cfg.modelFast,
                response_format: { type: 'json_object' } as any
            });
            const content = response.messages[response.messages.length - 1].content || '{}';
            plan = JSON.parse(content);
        } catch (e) {
            log.error('Researcher LLM failed', { error: e });
            plan = { queries: [state.sdd.goal || 'Analyze project'] };
        }

        const queries = plan.queries || [];
        if (queries.length === 0) {
            return { researchResults: { note: 'No queries generated' } };
        }

        const profile = state.runProfile || 'fast';
        const useDeep = profile === 'strict';
        // Profile enum: strict, fast, smoke, yolo.
        // Deep research is expensive. Use it for strict.
        // For fast/yolo, use shallow web search unless explicitly requested?
        // Ticket 15 optimized deep research, so it's good.
        // But let's respect profile.

        // Actually, let's use deepResearch for the *primary* query if strict, and webSearch for others?
        // Or just use deepResearch for the first query, as it covers a lot.

        const primaryQuery = queries[0];
        log.info('Executing research', { primaryQuery, count: queries.length, profile });

        try {
            if (profile === 'strict') {
                const result = await deepResearch(cfg, primaryQuery, {
                    originalGoal: state.sdd.goal,
                    maxAttempts: 3
                });
                return {
                    researchResults: result.findings,
                    researchQuality: result.quality || undefined
                };
            } else {
                // Shallow search for all queries
                const { webSearch } = await import('../../tools/web_search.js');
                const allFindings = [];
                for (const q of queries) {
                    const results = await webSearch(cfg, q, { maxResults: 3 });
                    allFindings.push(...results.map(r => ({
                        summary: r.snippet,
                        sources: [r.url],
                        title: r.title
                    })));
                }
                return {
                    researchResults: allFindings
                };
            }
        } catch (error) {
            log.error('Research execution failed', { error });
            return {
                researchResults: { error: String(error) }
            };
        }
    };
}
