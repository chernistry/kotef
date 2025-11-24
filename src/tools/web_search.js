// Simple in-memory cache: Map<query, WebSearchResult[]>
const searchCache = new Map();
export async function webSearch(cfg, query, options = {}) {
    const provider = options.provider || 'tavily';
    const cacheKey = `${provider}:${query}`;
    if (cfg.mockMode) {
        return [{
                url: 'https://example.com/mock',
                title: 'Mock Search Result',
                snippet: 'This is a mock search result for query: ' + query,
                source: 'mock'
            }];
    }
    if (searchCache.has(cacheKey)) {
        return searchCache.get(cacheKey);
    }
    // TODO: Add rate limiting / budget check against cfg.maxWebRequestsPerRun (needs state tracking)
    let results = [];
    try {
        if (provider === 'tavily') {
            results = await searchTavily(cfg, query, options.maxResults);
        }
        else {
            throw new Error(`Unsupported search provider: ${provider}`);
        }
    }
    catch (error) {
        // Wrap or rethrow
        throw new Error(`Search failed (${provider}): ${error.message}`);
    }
    searchCache.set(cacheKey, results);
    return results;
}
async function searchTavily(cfg, query, maxResults = 5) {
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
    const data = await response.json();
    return (data.results || []).map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.content,
        source: 'tavily',
    }));
}
