import { KotefConfig } from '../core/config.js';
import { webSearch } from './web_search.js';
import { fetchPage } from './fetch_page.js';
import { callChat, ChatMessage } from '../core/llm.js';
import { createLogger } from '../core/logger.js';
import { loadPrompt } from '../core/prompts.js';

export interface DeepResearchFinding {
    statement: string;
    citations: { url: string; title?: string; snippet?: string }[];
}

export interface DeepResearchOptions {
    /** Original natural-language goal (used for scoring and refinement). */
    originalGoal?: string;
    /** Max number of query attempts with refinement (including the first). */
    maxAttempts?: number;
}

interface ResearchQuality {
    relevance: number;
    confidence: number;
    coverage: number;
    shouldRetry: boolean;
    reasons: string;
}

interface ResearchAttempt {
    query: string;
    findings: DeepResearchFinding[];
    quality: ResearchQuality | null;
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
        const shouldRetry =
            typeof parsed.shouldRetry === 'boolean'
                ? parsed.shouldRetry
                : relevance < 0.7 || coverage < 0.7;
        const reasons = typeof parsed.reasons === 'string' ? parsed.reasons : 'No reasons provided.';

        return { relevance, confidence, coverage, shouldRetry, reasons };
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

    let promptTemplate: string;
    try {
        promptTemplate = await loadPrompt('research_query_refiner');
    } catch (e) {
        log.warn('research_query_refiner prompt missing or failed to load; skipping refinement', {
            error: (e as Error).message,
        });
        return null;
    }

    const qualitySummary = quality
        ? `Relevance: ${quality.relevance.toFixed(2)}, Confidence: ${quality.confidence.toFixed(
              2,
          )}, Coverage: ${quality.coverage.toFixed(2)}. Reasons: ${quality.reasons}`
        : 'No quality scores available.';

    const filled = promptTemplate
        .replace('{goal}', goal)
        .replace('{previousQuery}', previousQuery)
        .replace('{qualitySummary}', qualitySummary)
        .replace('{resultsSummary}', searchResultsSummary);

    const messages: ChatMessage[] = [
        {
            role: 'system',
            content:
                'You refine web search queries for software engineering tasks. Respond with a single optimized English query line, nothing else.',
        },
        { role: 'user', content: filled },
    ];

    try {
        const resp = await callChat(cfg, messages, {
            model: cfg.modelFast,
            temperature: 0,
            maxTokens: 64,
        });
        const raw = (resp.messages[resp.messages.length - 1]?.content || '').trim();
        const line = raw.split('\n')[0] || '';
        const cleaned = line.replace(/^("|')|("|')$/g, '').trim();
        return cleaned || null;
    } catch (e) {
        log.warn('Failed to refine research query', { error: (e as Error).message });
        return null;
    }
}

export async function deepResearch(
    cfg: KotefConfig,
    query: string,
    options: DeepResearchOptions = {},
): Promise<DeepResearchFinding[]> {
    const log = createLogger('deep-research');
    const originalGoal = options.originalGoal || query;
    const maxAttempts = Math.max(1, options.maxAttempts ?? 1);

    log.info('Starting deep research', { query, originalGoal, maxAttempts });

    const attempts: ResearchAttempt[] = [];
    let currentQuery = query;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        log.info('Performing web search...', { attempt: attempt + 1, query: currentQuery });
        const searchResults = await webSearch(cfg, currentQuery, { maxResults: 5 });
        log.info('Web search completed', {
            attempt: attempt + 1,
            resultsCount: searchResults.length,
        });

        if (searchResults.length === 0) {
            log.warn('No search results found for query', {
                attempt: attempt + 1,
                query: currentQuery,
            });
            attempts.push({
                query: currentQuery,
                findings: [],
                quality: null,
            });
            break;
        }

        const topResults = searchResults.slice(0, 3);
        log.info('Fetching top pages', { attempt: attempt + 1, count: topResults.length });
        const pageContents: string[] = [];

        for (const result of topResults) {
            try {
                log.info('Fetching page', { url: result.url });
                const page = await fetchPage(cfg, result.url);
                pageContents.push(
                    `Source: ${result.url}\nTitle: ${result.title}\nContent:\n${page.content}\n---`,
                );
                log.info('Page fetched successfully', {
                    url: result.url,
                    contentLength: page.content.length,
                });
            } catch (e) {
                log.warn('Failed to fetch page, using snippet', {
                    url: result.url,
                    error: (e as Error).message,
                });
                pageContents.push(
                    `Source: ${result.url}\nTitle: ${result.title}\nContent (Snippet only):\n${result.snippet}\n---`,
                );
            }
        }

        const context = pageContents.join('\n\n');

        log.info('Summarizing findings with LLM...', { attempt: attempt + 1 });
        const findings = await summarizeFindings(cfg, currentQuery, context);

        const searchResultsSummary = searchResults
            .map(r => `- ${r.title || 'Untitled'} (${r.url})`)
            .join('\n')
            .slice(0, 2000);

        const quality = await scoreResearchAttempt(
            cfg,
            originalGoal,
            currentQuery,
            searchResultsSummary,
            findings,
        );

        if (quality) {
            log.info('Research quality scored', {
                attempt: attempt + 1,
                relevance: quality.relevance,
                confidence: quality.confidence,
                coverage: quality.coverage,
                shouldRetry: quality.shouldRetry,
            });
        }

        attempts.push({ query: currentQuery, findings, quality });

        const goodEnough =
            quality &&
            quality.relevance >= 0.7 &&
            quality.coverage >= 0.6 &&
            quality.confidence >= 0.6;

        if (goodEnough || attempt === maxAttempts - 1) {
            break;
        }

        if (!quality || !quality.shouldRetry) {
            log.info('Quality scoring suggests no retry; stopping after current attempt.', {
                attempt: attempt + 1,
            });
            break;
        }

        const refined = await refineResearchQuery(
            cfg,
            originalGoal,
            currentQuery,
            searchResultsSummary,
            quality,
        );

        if (!refined || refined === currentQuery) {
            log.info('Refiner did not produce a new query; stopping retries.', {
                attempt: attempt + 1,
            });
            break;
        }

        log.info('Refined research query for next attempt', {
            attempt: attempt + 2,
            previousQuery: currentQuery,
            refinedQuery: refined,
        });
        currentQuery = refined;
    }

    if (attempts.length === 0) {
        log.warn('Deep research completed with no attempts; returning empty findings.');
        return [];
    }

    let best = attempts[0];
    let bestScore = -1;

    for (const attempt of attempts) {
        if (attempt.quality) {
            const q = attempt.quality;
            const score = q.relevance * 0.6 + q.coverage * 0.25 + q.confidence * 0.15;
            if (score > bestScore) {
                bestScore = score;
                best = attempt;
            }
        }
    }

    if (bestScore < 0) {
        best = attempts.reduce((acc, cur) =>
            cur.findings.length > acc.findings.length ? cur : acc,
        );
    }

    const chosenQuality = best.quality;
    log.info('Deep research completed', {
        attempts: attempts.length,
        chosenQuery: best.query,
        findingsCount: best.findings.length,
        relevance: chosenQuality?.relevance,
        confidence: chosenQuality?.confidence,
        coverage: chosenQuality?.coverage,
    });

    return best.findings;
}
