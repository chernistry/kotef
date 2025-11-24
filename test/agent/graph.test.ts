import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildKotefGraph } from '../../src/agent/graph.js';
import { loadConfig } from '../../src/core/config.js';
import { AgentState } from '../../src/agent/state.js';

describe('Agent Graph', () => {
    // Mock env vars BEFORE loading config
    const originalEnv = process.env;
    process.env = { ...originalEnv, KOTEF_API_KEY: 'dummy-key', SEARCH_API_KEY: 'dummy-key' };

    const cfg = loadConfig();

    afterEach(() => {
        // Restore env if needed, though cfg is already loaded
        // process.env = originalEnv;
    });

    it('should compile and run a simple flow', async () => {
        const graph = buildKotefGraph(cfg);

        const initialState: Partial<AgentState> = {
            messages: [],
            sdd: {
                project: 'Test Project',
                architect: 'Test Architect',
            },
            hasSdd: true
        };

        // Mock deepResearch to avoid network calls
        // We can't easily mock the import inside the node without a DI system or module mocking.
        // For this integration test, we might hit the real node functions which call real tools.
        // BUT, our researcherNode calls deepResearch.
        // We should mock deepResearch.
        // Since we are using native node:test, we can use the loader hooks or just mock the function if it was exported from a mutable object.
        // But ESM imports are immutable.

        // Workaround: We'll rely on the fact that deepResearch calls webSearch, and we can mock fetch globally which webSearch uses.
        // Or we can just accept that it might try to run.
        // Actually, deepResearch calls webSearch -> fetchPage.
        // We can mock global.fetch to return empty results, so deepResearch returns empty.

        const originalFetch = global.fetch;
        global.fetch = mock.fn(async () => ({
            ok: true,
            json: async () => ({ results: [] }), // Tavily response
            text: async () => '',
            headers: { get: () => '' }
        })) as any;

        try {
            const result = await graph.invoke(initialState);

            assert.ok(result.done, 'Graph should complete');
            assert.ok(result.testResults, 'Should have test results');
        } finally {
            global.fetch = originalFetch;
        }
    });
});
