import { KotefConfig } from '../core/config.js';
import { webSearch } from './web_search.js';
import { fetchPage } from './fetch_page.js';
import { callChat, ChatMessage } from '../core/llm.js';
import { createLogger } from '../core/logger.js';

export interface DeepResearchFinding {
    statement: string;
    citations: { url: string; title?: string; snippet?: string }[];
}

export async function deepResearch(
    cfg: KotefConfig,
    query: string,
): Promise<DeepResearchFinding[]> {
    const log = createLogger('deep-research');
    log.info('Starting deep research', { query });
    
    // 1. Search
    log.info('Performing web search...');
    const searchResults = await webSearch(cfg, query, { maxResults: 5 });
    log.info('Web search completed', { resultsCount: searchResults.length });

    if (searchResults.length === 0) {
        log.warn('No search results found');
        return [];
    }

    // 2. Fetch top 3 pages
    const topResults = searchResults.slice(0, 3);
    log.info('Fetching top pages', { count: topResults.length });
    const pageContents: string[] = [];

    for (const result of topResults) {
        try {
            log.info('Fetching page', { url: result.url });
            const page = await fetchPage(cfg, result.url);
            pageContents.push(`Source: ${result.url}\nTitle: ${result.title}\nContent:\n${page.content}\n---`);
            log.info('Page fetched successfully', { url: result.url, contentLength: page.content.length });
        } catch (e) {
            log.warn('Failed to fetch page, using snippet', { url: result.url, error: (e as Error).message });
            // Fallback to snippet if fetch fails
            pageContents.push(`Source: ${result.url}\nTitle: ${result.title}\nContent (Snippet only):\n${result.snippet}\n---`);
        }
    }

    // 3. Summarize with LLM
    log.info('Summarizing findings with LLM...');
    const context = pageContents.join('\n\n');
    const prompt = `
You are a research assistant. Answer the user's query based ONLY on the provided sources.
Extract key findings and back them up with citations.

Query: ${query}

Sources:
${context}

Output Format: JSON array of objects with "statement" (string) and "citations" (array of {url, title}).
Do not output markdown code blocks, just the raw JSON string.
`;

    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful research assistant. Output valid JSON only.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await callChat(cfg, messages, {
            model: cfg.modelFast, // Use fast model for summarization
            temperature: 0,
            maxTokens: 2000,
        });

        const content = response.messages[response.messages.length - 1].content;
        if (!content) {
            log.warn('LLM returned empty content');
            return [];
        }

        // Clean up potential markdown blocks
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();

        const findings = JSON.parse(jsonStr) as DeepResearchFinding[];
        log.info('Deep research completed', { findingsCount: findings.length });
        return findings;
    } catch (e) {
        log.error('Deep research summarization failed', { error: (e as Error).message });
        return [];
    }
}
