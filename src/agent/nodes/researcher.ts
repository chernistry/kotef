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

        const sddBest = state.sdd.bestPractices || '';
        if (sddBest.trim().length > 0) {
            log.info('Existing SDD best_practices.md detected; will use it as context but allow fresh research.');
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
        const primaryQuery = queries[0];
        log.info('Executing research', { primaryQuery, count: queries.length, profile });

        try {
            if (profile === 'strict') {
                // If we already have research for this query and quality says "no retry",
                // avoid redundant deep research and surface a "no new info" signal.
                if (
                    state.researchQuality &&
                    state.researchQuality.lastQuery === primaryQuery &&
                    state.researchQuality.shouldRetry === false
                ) {
                    log.info('Repeated strict research request with no new info; reusing existing findings.');
                    return {
                        researchResults: state.researchResults,
                        researchQuality: {
                            ...state.researchQuality,
                            reasons: `${state.researchQuality.reasons}\n\n[researcher] No new information found; repeated query "${primaryQuery}".`
                        }
                    };
                }

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
