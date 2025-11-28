import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { deepResearch } from '../../tools/deep_research.js';
import { createLogger } from '../../core/logger.js';
import { jsonrepair } from 'jsonrepair';
import { analyzeImpact } from '../utils/impact.js';
import { scanContext } from './planner.js';
import { loadResearchCache, matchGoalToCache } from '../utils/research_cache.js';

function getTaskTypeHint(text: string): 'reference' | 'debug' | 'architecture' | 'research' {
    const lower = text.toLowerCase();
    if (lower.includes('architecture') || lower.includes('design') || lower.includes('pattern') || lower.includes('structure')) {
        return 'architecture';
    }
    if (lower.includes('error') || lower.includes('fail') || lower.includes('fix') || lower.includes('bug') || lower.includes('exception') || lower.includes('stack')) {
        return 'debug';
    }
    if (lower.includes('how to') || lower.includes('example') || lower.includes('syntax') || lower.includes('api')) {
        return 'reference';
    }
    return 'research';
}

export function researcherNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('researcher');
        log.info('Researcher node started');

        // Ticket 03: Check research cache before hitting web
        const goal = state.sdd.goal || '';
        const cachedEntries = await loadResearchCache(cfg.rootDir || process.cwd());
        if (cachedEntries) {
            const match = matchGoalToCache(goal, cachedEntries);
            if (match && match.findings.length > 0) {
                log.info('Reusing SDD research from cache', { cachedGoal: match.goal, findingsCount: match.findings.length });
                return {
                    researchResults: {
                        source: 'sdd',
                        findings: match.findings
                    },
                    researchQuality: match.quality ? {
                        lastQuery: match.query,
                        relevance: match.quality.relevance,
                        confidence: match.quality.confidence,
                        coverage: match.quality.coverage,
                        support: match.quality.support,
                        recency: match.quality.recency,
                        diversity: match.quality.diversity,
                        hasConflicts: match.quality.hasConflicts,
                        shouldRetry: false,
                        reasons: `Reused from SDD cache (goal: "${match.goal}")`,
                        attemptCount: 0
                    } : undefined
                };
            }
        }

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
            '{{TASK_SCOPE}}': state.taskScope || 'normal',
            '{{FILE_LIST}}': safe(state.contextScan?.files || []),
            '{{IMPACT_HINT}}': '' // Will be populated below
        };

        // Run heuristic impact analysis
        try {
            // Ensure context scan is available
            if (!state.contextScan) {
                state.contextScan = await scanContext(cfg.rootDir || process.cwd());
                replacements['{{FILE_LIST}}'] = safe(state.contextScan.files);
            }

            const goalToAnalyze = state.clarified_goal?.functional_outcomes?.join('\n') || state.sdd.goal || '';
            const analysis = await analyzeImpact(goalToAnalyze, cfg.rootDir || process.cwd(), state.gitHotspots);
            replacements['{{IMPACT_HINT}}'] = safe(analysis);
        } catch (e) {
            log.warn('Impact analysis hint failed', { error: e });
        }

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
            let content = response.messages[response.messages.length - 1].content || '{}';
            let raw = content.trim();

            // Some providers may still wrap JSON in fences despite response_format
            if (raw.startsWith('```')) {
                const fenceMatch = raw.match(/^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n```$/);
                if (fenceMatch && fenceMatch[1]) {
                    raw = fenceMatch[1].trim();
                }
            }

            try {
                plan = JSON.parse(raw);
            } catch {
                plan = JSON.parse(jsonrepair(raw));
            }
        } catch (e) {
            log.error('Researcher LLM failed', { error: e });
            // Fallback: derive explicit, grounded queries from the goal instead of generic "Analyze project"
            const goalText = state.sdd.goal || '';
            const fallbackQueries = goalText.trim().length > 0
                ? [
                    goalText.slice(0, 200), // Primary: the goal itself
                    `best practices ${goalText}`.slice(0, 200) // Secondary: best practices + goal
                ]
                : ['software development best practices', 'modern coding practices']; // Last resort when no goal

            plan = {
                queries: fallbackQueries,
                reason: 'LLM plan parsing failed; using goal-derived fallback queries'
            };
            log.warn('Using fallback research queries', { queries: fallbackQueries });
        }

        const queries = plan.queries || [];
        if (queries.length === 0) {
            return { researchResults: { note: 'No queries generated' } };
        }

        const profile = state.runProfile || 'fast';
        const taskScope = state.taskScope || 'normal';
        const taskTypeHint = getTaskTypeHint((state.sdd.goal || '') + ' ' + (state.sdd.ticket || ''));
        const sddContextSnippet = (state.sdd.bestPractices || '').slice(0, 1000);

        // Decision logic:
        // - Tiny scope -> shallow search (unless strict profile)
        // - Large scope / Architecture / Research -> deep research
        // - Debug -> deep research (handled by strategy)
        // - Strict profile -> deep research

        const useDeep = profile === 'strict' ||
            taskScope === 'large' ||
            taskTypeHint === 'architecture' ||
            taskTypeHint === 'research';

        const primaryQuery = queries[0];
        log.info('Executing research', { primaryQuery, count: queries.length, profile, taskScope, taskTypeHint, useDeep });

        // Ticket 66: Offline Mode Handling
        if (cfg.offlineMode) {
            log.info('Offline mode enabled: skipping web research.');
            return {
                researchResults: {
                    note: 'Offline mode: Web research skipped. Relying on internal knowledge and context.',
                    queries_skipped: queries
                }
            };
        }

        try {
            if (useDeep && taskScope !== 'tiny') {
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
                    taskScope,
                    taskTypeHint,
                    sddContextSnippet
                });
                return {
                    researchResults: result.findings,
                    researchQuality: result.quality || undefined,
                    impactMap: plan.impact_map,
                    riskMap: plan.risk_map
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
                    researchResults: allFindings,
                    impactMap: plan.impact_map,
                    riskMap: plan.risk_map
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
