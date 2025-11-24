import { describe, it, expect, vi, afterEach } from 'vitest';
import { webSearch } from '../../src/tools/web_search.js';
import { fetchPage } from '../../src/tools/fetch_page.js';
// import { deepResearch } from '../../src/tools/deep_research.js';
import { loadConfig } from '../../src/core/config.js';

const originalFetch = global.fetch;

describe('Search Tools', () => {
    // Mock env vars BEFORE loading config
    const originalEnv = process.env;
    process.env = { ...originalEnv, KOTEF_API_KEY: 'dummy-key', SEARCH_API_KEY: 'dummy-key' };

    const cfg = loadConfig();

    afterEach(() => {
        global.fetch = originalFetch;
        // We don't restore process.env here because we modified it for the whole suite scope variable `cfg`.
        // But ideally we should. Since `cfg` is loaded once, it's fine.
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

            const results = await webSearch({ apiKey: 'test-key' } as any, 'test query');
            expect(results.length).toBe(1);
            expect(results[0].title).toBe('Test');
        });

        it('should handle API errors', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                statusText: 'Unauthorized'
            });
            global.fetch = mockFetch as any;

            const results = await webSearch({ apiKey: 'test-key' } as any, 'test query');
            expect(results.length).toBe(0);
        });

        it('should throw if API key is missing', async () => {
            await expect(webSearch({} as any, 'test query')).rejects.toThrow(/API key is required/);
        });
        it('should block unsafe URLs', async () => {
            await expect(fetchPage(cfg, 'http://localhost:8080')).rejects.toThrow(/blocked by policy/);
        });
    });

    // deepResearch test is harder to mock fully without mocking callChat. 
    // We'll skip deep logic test here and rely on integration tests or mock callChat if possible.
    // For now, let's just test that it calls webSearch and fetchPage.
});
