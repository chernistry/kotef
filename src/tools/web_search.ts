import { KotefConfig } from '../core/config.js';

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
    const provider = options.provider || 'tavily';
    const cacheKey = `${provider}:${query}`;

    if (searchCache.has(cacheKey)) {
        return searchCache.get(cacheKey)!;
    }

    // TODO: Add rate limiting / budget check against cfg.maxWebRequestsPerRun (needs state tracking)

    let results: WebSearchResult[] = [];

    try {
        if (provider === 'tavily') {
            results = await searchTavily(cfg, query, options.maxResults);
        } else {
            throw new Error(`Unsupported search provider: ${provider}`);
        }
    } catch (error) {
        // Wrap or rethrow
        throw new Error(`Search failed (${provider}): ${(error as Error).message}`);
    }

    searchCache.set(cacheKey, results);
    return results;
}

async function searchTavily(cfg: KotefConfig, query: string, maxResults = 5): Promise<WebSearchResult[]> {
    if (!cfg.searchApiKey) {
        throw new Error('Search API key is missing (TAVILY_API_KEY)');
    }

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
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { results?: any[] };

    return (data.results || []).map((r: any) => ({
        url: r.url,
        title: r.title,
        snippet: r.content,
        source: 'tavily',
    }));
}
