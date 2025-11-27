import { KotefConfig } from '../core/config.js';
import { webSearch } from './web_search.js';
import { fetchPage } from './fetch_page.js';
import { callChat, ChatMessage } from '../core/llm.js';
import { createLogger } from '../core/logger.js';
import { loadPrompt } from '../core/prompts.js';

export interface DeepResearchFinding {
    statement: string;
    citations: { url: string; title?: string; snippet?: string }[];
    support_strength?: number; // 0–1
    recency_score?: number;    // 0–1, higher = more recent
    source_diversity?: number; // 0–1
    conflicts?: string[];      // short notes if sources disagree
}

export interface WebSearchResult {
    url: string;
    title: string;
    snippet: string;
    source?: string;
}

export interface DeepResearchResult {
    findings: DeepResearchFinding[];
    quality: (ResearchQuality & { lastQuery: string; attemptCount: number }) | null;
    rawSearchResults?: WebSearchResult[];
    rawPagesSample?: { url: string; content: string }[];
}

export interface DeepResearchOptions {
    /** Original natural-language goal (used for scoring and refinement). */
    originalGoal?: string;
    /** Max number of query attempts with refinement (including the first). */
    maxAttempts?: number;
    /** Scope of the task to determine research depth. */
    taskScope?: 'tiny' | 'normal' | 'large';
    /** Type of task to hint strategy selection. */
    taskTypeHint?: 'reference' | 'debug' | 'architecture' | 'research';
    /** Relevant SDD context to guide research. */
    sddContextSnippet?: string;
    /** Technical stack hint. */
    techStackHint?: string;
}

export interface ResearchStrategy {
    level: 'none' | 'shallow' | 'medium' | 'deep';
    maxAttempts: number;
    maxResults: number;
    topPages: number;
    searchDepth: 'basic' | 'advanced';
}

export function computeResearchStrategy(
    goal: string,
    options: DeepResearchOptions
): ResearchStrategy {
    const scope = options.taskScope || 'normal';
    const type = options.taskTypeHint;

    // Default strategy: medium
    let strategy: ResearchStrategy = {
        level: 'medium',
        maxAttempts: 3,
        maxResults: 5,
        topPages: 3,
        searchDepth: 'basic'
    };

    if (scope === 'tiny') {
        strategy = { level: 'shallow', maxAttempts: 1, maxResults: 3, topPages: 1, searchDepth: 'basic' };
    } else if (scope === 'large' || type === 'architecture' || type === 'research') {
        strategy = { level: 'deep', maxAttempts: 4, maxResults: 7, topPages: 5, searchDepth: 'advanced' };
    }

    // Overrides if explicit maxAttempts is provided (legacy compatibility)
    if (options.maxAttempts !== undefined) {
        strategy.maxAttempts = Math.max(1, options.maxAttempts);
    }

    return strategy;
}

export interface ResearchQuality {
    relevance: number;
    confidence: number;
    coverage: number;
    support: number; // 0-1
    recency: number; // 0-1
    diversity: number; // 0-1
    hasConflicts: boolean;
    shouldRetry: boolean;
    reasons: string;
}

interface ResearchAttempt {
    query: string;
    findings: DeepResearchFinding[];
    quality: ResearchQuality | null;
    rawSearchResults?: WebSearchResult[];
    rawPagesSample?: { url: string; content: string }[];
}

async function summarizeFindings(
    cfg: KotefConfig,
    query: string,
    context: string,
): Promise<DeepResearchFinding[]> {
    const log = createLogger('deep-research');
    const prompt = `
You are a research assistant. Answer the user's query based ONLY on the provided sources.
Extract key findings and back them up with citations.

Query: ${query}

Sources:
${context}

Output Format: JSON array of objects with "statement" (string) and "citations" (array of {url, title, snippet?}).
Do not output markdown code blocks, just the raw JSON string.
`;

    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful research assistant. Output valid JSON only.' },
        { role: 'user', content: prompt }
    ];

    const response = await callChat(cfg, messages, {
        model: cfg.modelFast,
        temperature: 0,
        maxTokens: 2000,
    });

    const content = response.messages[response.messages.length - 1].content;
    if (!content) {
        log.warn('LLM returned empty content');
        return [];
    }

    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
        const findings = JSON.parse(jsonStr) as DeepResearchFinding[];
        return findings;
    } catch (e) {
        log.error('Failed to parse deep research JSON', { error: (e as Error).message });
        return [];
    }
}

async function scoreResearchAttempt(
    cfg: KotefConfig,
    goal: string,
    query: string,
    searchResultsSummary: string,
    findings: DeepResearchFinding[],
): Promise<ResearchQuality | null> {
    const log = createLogger('deep-research');

    let promptTemplate: string;
    try {
        promptTemplate = await loadPrompt('research_relevance_evaluator');
    } catch (e) {
        log.warn('research_relevance_evaluator prompt missing or failed to load; skipping scoring', {
            error: (e as Error).message,
        });
        return null;
    }

    const findingsPreview = findings.slice(0, 6);
    const findingsJson = JSON.stringify(findingsPreview, null, 2);
    const filled = promptTemplate
        .replace('{goal}', goal)
        .replace('{query}', query)
        .replace('{resultsSummary}', searchResultsSummary)
        .replace('{findingsJson}', findingsJson);

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content:
                'You evaluate how relevant and actionable web research findings are for a software engineering task. Output strictly valid JSON.',
        },
        { role: 'user', content: filled },
    ];

    try {
        const resp = await callChat(cfg, messages, {
            model: cfg.modelFast,
            temperature: 0,
            maxTokens: 300,
        });
        const raw = resp.messages[resp.messages.length - 1].content || '';
        const jsonStr = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr) as Partial<ResearchQuality>;

        const relevance = typeof parsed.relevance === 'number' ? parsed.relevance : 0.5;
        const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
        const coverage = typeof parsed.coverage === 'number' ? parsed.coverage : 0.5;
        const support = typeof parsed.support === 'number' ? parsed.support : 0.5;
        const recency = typeof parsed.recency === 'number' ? parsed.recency : 0.5;
        const diversity = typeof parsed.diversity === 'number' ? parsed.diversity : 0.5;
        const hasConflicts = typeof parsed.hasConflicts === 'boolean' ? parsed.hasConflicts : false;

        const shouldRetry =
            typeof parsed.shouldRetry === 'boolean'
                ? parsed.shouldRetry
                : relevance < 0.7 || coverage < 0.7;
        const reasons = typeof parsed.reasons === 'string' ? parsed.reasons : 'No reasons provided.';

        return { relevance, confidence, coverage, support, recency, diversity, hasConflicts, shouldRetry, reasons };
    } catch (e) {
        log.warn('Failed to score research attempt; proceeding without scoring', {
            error: (e as Error).message,
        });
        return null;
    }
}

async function refineResearchQuery(
    cfg: KotefConfig,
    goal: string,
    previousQuery: string,
    searchResultsSummary: string,
    quality: ResearchQuality | null,
): Promise<string | null> {
    const log = createLogger('deep-research');

    try {
        const promptTemplate = await loadPrompt('research_query_refiner');
        const qualitySummary = quality
            ? `Relevance: ${quality.relevance}, Confidence: ${quality.confidence}, Coverage: ${quality.coverage}. Reasons: ${quality.reasons}`
            : 'No quality scores available.';

        const filled = promptTemplate
            .replace('{{GOAL}}', goal)
            .replace('{{PREVIOUS_QUERY}}', previousQuery)
            .replace('{{QUALITY_SUMMARY}}', qualitySummary)
            .replace('{{RESULTS_SUMMARY}}', searchResultsSummary);

        const messages: ChatMessage[] = [{ role: 'user', content: filled }];
        const resp = await callChat(cfg, messages, { model: cfg.modelFast, temperature: 0 });
        const jsonStr = (resp.messages[resp.messages.length - 1]?.content || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        if (parsed.should_retry && parsed.query) {
            return parsed.query;
        }
        return null;
    } catch (e) {
        log.warn('Failed to refine research query', { error: (e as Error).message });
        return null;
    }
}


export async function deepResearch(
    cfg: KotefConfig,
    goal: string,
    options: DeepResearchOptions = {},
): Promise<DeepResearchResult> {
    const log = createLogger('deep-research');
    const strategy = computeResearchStrategy(goal, options);
    const techStackHint = options.techStackHint || '';

    // Config-driven limits
    const maxTokens = cfg.deepResearchMaxTokens || 2000;
    const maxPages = cfg.deepResearchMaxPages || strategy.topPages;
    const snippetChars = cfg.deepResearchPageSnippetChars || 4000;

    log.info('Starting deep research', { goal, techStackHint, strategy, limits: { maxTokens, maxPages, snippetChars } });

    const maxAttempts = strategy.maxAttempts;

    // 1. Optimize initial query
    let currentQuery = goal;
    try {
        const optimizerPrompt = await loadPrompt('search_query_optimizer');
        const filled = optimizerPrompt
            .replace('{{GOAL}}', goal)
            .replace('{{TECH_STACK_HINT}}', techStackHint)
            .replace('{{CONTEXT}}', ''); // Could pass SDD context here if available

        const messages: ChatMessage[] = [{ role: 'user', content: filled }];
        const resp = await callChat(cfg, messages, { model: cfg.modelFast, temperature: 0 });
        const jsonStr = (resp.messages[resp.messages.length - 1]?.content || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed.query) {
            currentQuery = parsed.query;
            log.info('Optimized initial query', { original: goal, optimized: currentQuery, reason: parsed.reason });
        }
    } catch (e) {
        log.warn('Failed to optimize query, using goal as is', { error: (e as Error).message });
    }

    const attempts: ResearchAttempt[] = [];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        log.info('Performing web search...', { attempt: attempt + 1, query: currentQuery });

        let searchResults: any[] = [];
        try {
            searchResults = await webSearch(cfg, currentQuery, {
                maxResults: strategy.maxResults,
                search_depth: strategy.searchDepth
            });
        } catch (e) {
            log.warn('Web search failed', { error: (e as Error).message });
        }

        if (searchResults.length === 0) {
            log.warn('No search results found', { attempt: attempt + 1 });
            attempts.push({ query: currentQuery, findings: [], quality: null });

            // Try to refine even if empty, maybe the query was bad
            const refined = await refineResearchQuery(cfg, goal, currentQuery, 'No results found.', null);
            if (refined && refined !== currentQuery) {
                currentQuery = refined;
                continue;
            }
            break;
        }

        // Fetch pages
        const topResults = searchResults.slice(0, maxPages);
        const pageContents: string[] = [];
        const rawPagesSample: { url: string; content: string }[] = [];

        for (const result of topResults) {
            try {
                const page = await fetchPage(cfg, result.url);
                const truncatedContent = page.content.slice(0, snippetChars);
                pageContents.push(`Source: ${result.url}\nTitle: ${result.title}\nContent:\n${truncatedContent}\n---`);
                rawPagesSample.push({ url: result.url, content: truncatedContent });
            } catch (e) {
                pageContents.push(`Source: ${result.url}\nTitle: ${result.title}\nContent (Snippet):\n${result.snippet}\n---`);
            }
        }

        const context = pageContents.join('\n\n');
        const findings = await summarizeFindings(cfg, currentQuery, context);

        const searchResultsSummary = searchResults.map(r => `- ${r.title} (${r.url})`).join('\n').slice(0, 2000);

        // Score attempt
        let quality: ResearchQuality | null = null;
        try {
            const evalPrompt = await loadPrompt('research_relevance_evaluator');
            const filledEval = evalPrompt
                .replace('{{GOAL}}', goal)
                .replace('{{QUERY}}', currentQuery)
                .replace('{{RESULTS_SUMMARY}}', searchResultsSummary)
                .replace('{{FINDINGS_JSON}}', JSON.stringify(findings.slice(0, 5), null, 2));

            const evalResp = await callChat(cfg, [{ role: 'user', content: filledEval }], { model: cfg.modelFast, temperature: 0 });
            const evalJson = (evalResp.messages[evalResp.messages.length - 1]?.content || '').replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedEval = JSON.parse(evalJson);

            quality = {
                relevance: parsedEval.relevance || 0,
                confidence: parsedEval.confidence || 0,
                coverage: parsedEval.coverage || 0,
                support: typeof parsedEval.support === 'number' ? parsedEval.support : 0.5,
                recency: typeof parsedEval.recency === 'number' ? parsedEval.recency : 0.5,
                diversity: typeof parsedEval.diversity === 'number' ? parsedEval.diversity : 0.5,
                hasConflicts: parsedEval.hasConflicts || false,
                shouldRetry: parsedEval.should_retry ?? true,
                reasons: parsedEval.reasons || ''
            };
        } catch (e) {
            log.warn('Failed to score research', { error: (e as Error).message });
        }

        attempts.push({ query: currentQuery, findings, quality, rawSearchResults: searchResults, rawPagesSample });

        // Check if good enough
        if (quality && quality.relevance >= 0.7 && quality.coverage >= 0.6) {
            log.info('Research quality met thresholds', { quality });
            break;
        }

        // Diminishing returns check
        if (attempt > 0 && attempts[attempt - 1].quality) {
            const prev = attempts[attempt - 1].quality!;
            const current = quality!;
            const improvement = (current.relevance - prev.relevance) + (current.coverage - prev.coverage);
            if (improvement < 0.05) {
                log.info('Stopping due to diminishing returns', { improvement, attempt });
                break;
            }
        }

        if (attempt === maxAttempts - 1) break;

        // Refine query
        if (quality?.shouldRetry !== false) {
            const refined = await refineResearchQuery(cfg, goal, currentQuery, searchResultsSummary, quality);
            if (refined && refined !== currentQuery) {
                currentQuery = refined;
                log.info('Refined query', { newQuery: currentQuery });
                continue;
            }
        }
        break;
    }

    // Select best attempt
    let best = attempts[0];
    let bestScore = -1;
    for (const att of attempts) {
        if (att.quality) {
            const score = att.quality.relevance * 0.5 + att.quality.coverage * 0.3 + att.quality.confidence * 0.2;
            if (score > bestScore) {
                bestScore = score;
                best = att;
            }
        }
    }

    // Fallback if no quality
    if (bestScore < 0 && attempts.length > 0) {
        best = attempts.reduce((a, b) => b.findings.length > a.findings.length ? b : a);
    }

    return {
        findings: best?.findings || [],
        quality: best?.quality ? { ...best.quality, lastQuery: best.query, attemptCount: attempts.length } : null,
        rawSearchResults: (best as any)?.rawSearchResults,
        rawPagesSample: (best as any)?.rawPagesSample
    };
}
