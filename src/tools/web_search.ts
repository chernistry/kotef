import { KotefConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

export interface WebSearchOptions {
    provider?: 'tavily' | 'brave' | 'serper';
    maxResults?: number;
}

export interface WebSearchResult {
    url: string;
    title: string;
    snippet?: string;
    source: string; // provider id
}

// Simple in-memory cache: Map<query, WebSearchResult[]>
const searchCache = new Map<string, WebSearchResult[]>();

export async function webSearch(
    cfg: KotefConfig,
    query: string,
    options: WebSearchOptions = {},
): Promise<WebSearchResult[]> {
    const log = createLogger('web-search');
    const provider = options.provider || 'tavily';
    const cacheKey = `${provider}:${query}`;

    log.info('Web search started', { query, provider, maxResults: options.maxResults });

    if (cfg.mockMode) {
        log.info('Mock mode enabled, returning mock results');
        return [{
            url: 'https://example.com/mock',
            title: 'Mock Search Result',
            snippet: 'This is a mock search result for query: ' + query,
            source: 'mock'
        }];
    }

    if (searchCache.has(cacheKey)) {
        log.info('Returning cached results', { cacheKey });
        return searchCache.get(cacheKey)!;
    }

    // TODO: Add rate limiting / budget check against cfg.maxWebRequestsPerRun (needs state tracking)

    let results: WebSearchResult[] = [];

    try {
        if (provider === 'tavily') {
            results = await searchTavily(cfg, query, options.maxResults);
            log.info('Search completed', { provider, resultsCount: results.length });
        } else {
            throw new Error(`Unsupported search provider: ${provider}`);
        }
    } catch (error) {
        log.error('Search failed', { provider, error: (error as Error).message });
        // Wrap or rethrow
        throw new Error(`Search failed (${provider}): ${(error as Error).message}`);
    }

    searchCache.set(cacheKey, results);
    return results;
}

async function searchTavily(cfg: KotefConfig, query: string, maxResults = 5): Promise<WebSearchResult[]> {
    const log = createLogger('tavily');
    
    if (!cfg.searchApiKey) {
        log.error('Tavily API key missing');
        throw new Error('Search API key is missing (TAVILY_API_KEY)');
    }

    log.info('Calling Tavily API', { query, maxResults });

    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            api_key: cfg.searchApiKey,
            query,
            max_results: maxResults,
            search_depth: 'basic', // or 'advanced' if we want deep search
        }),
    });

    if (!response.ok) {
        log.error('Tavily API error', { status: response.status, statusText: response.statusText });
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { results?: any[] };
    const results = (data.results || []).map((r: any) => ({
        url: r.url,
        title: r.title,
        snippet: r.content,
        source: 'tavily',
    }));

    log.info('Tavily API response received', { resultsCount: results.length });
    return results;
}
