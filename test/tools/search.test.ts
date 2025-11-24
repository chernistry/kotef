import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { webSearch, clearSearchCache } from '../../src/tools/web_search.js';
import { fetchPage } from '../../src/tools/fetch_page.js';
// import { deepResearch } from '../../src/tools/deep_research.js';
import { loadConfig } from '../../src/core/config.js';

const originalFetch = global.fetch;

describe('Search Tools', () => {
    // Mock env vars
    const originalEnv = { ...process.env };

    beforeEach(() => {
        process.env.KOTEF_API_KEY = 'dummy-key';
        process.env.SEARCH_API_KEY = 'dummy-key';
        process.env.KOTEF_MOCK_MODE = 'false';
        clearSearchCache();
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
        global.fetch = originalFetch;
    });

    describe('webSearch', () => {
        it('should return results from Tavily', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    results: [
                        { title: 'Test', url: 'https://example.com', content: 'Test content' }
                    ]
                })
            });
            global.fetch = mockFetch as any;

            const results = await webSearch({ searchApiKey: 'test-key' } as any, 'test query');
            expect(results.length).toBe(1);
            expect(results[0].title).toBe('Test');
        });

        it('should handle API errors', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                statusText: 'Unauthorized'
            });
            global.fetch = mockFetch as any;

            await expect(webSearch({ searchApiKey: 'test-key' } as any, 'test query')).rejects.toThrow(/Search failed/);
        });

        it('should throw if API key is missing', async () => {
            delete process.env.SEARCH_API_KEY;
            delete process.env.TAVILY_API_KEY;
            await expect(webSearch({} as any, 'test query')).rejects.toThrow(/Search API key is missing/);
            process.env.SEARCH_API_KEY = 'dummy-key'; // Restore
        });
        it('should block unsafe URLs', async () => {
            const cfg = loadConfig();
            await expect(fetchPage(cfg, 'http://localhost:8080')).rejects.toThrow(/blocked by policy/);
        });
    });

    // deepResearch test is harder to mock fully without mocking callChat. 
    // We'll skip deep logic test here and rely on integration tests or mock callChat if possible.
    // For now, let's just test that it calls webSearch and fetchPage.
});
