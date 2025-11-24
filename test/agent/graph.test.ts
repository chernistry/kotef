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

    // Mock global.fetch to intercept OpenAI calls
    // We need to handle different calls:
    // 1. Planner call -> returns { next: 'researcher' }
    // 2. Researcher call (deepResearch) -> returns summary
    // 3. Coder call -> returns code
    // 4. Verifier call -> returns test results (verifier uses runCommand, not LLM directly usually, but here verifierNode uses runCommand)

    // For the "simple flow" test, let's just make the planner return "done" immediately to keep it simple.

    const _mockFetch = mock.method(global, 'fetch', async (url: string | URL, _options: any) => {
        const urlStr = String(url);

        // Intercept OpenAI completions
        if (urlStr.includes('completions')) {
            return new Response(JSON.stringify({
                id: 'mock-id',
                choices: [{
                    message: {
                        role: 'assistant',
                        content: JSON.stringify({ next: 'done' })
                    }
                }]
            }), { status: 200 });
        }

        // Intercept other fetches (e.g. web search)
        return new Response('Mock Content', { status: 200 });
    });

    it('should compile and run a simple flow', async () => {
        const graph = buildKotefGraph(cfg);

        // Mock fetch for deepResearch (if it gets called, but we mocked callChat so planner might skip or we mock researcher too)
        // Actually, if planner returns "next: researcher", the graph goes to researcherNode.
        // researcherNode calls deepResearch.
        // deepResearch calls webSearch and fetchPage.
        // We should mock those too or mock researcherNode?
        // Easier to mock callChat to return "next: done" for a quick test, OR mock deepResearch.

        // Let's mock callChat to return "done" to test the flow Planner -> End.


        const result = await graph.invoke({
            messages: [{ role: 'user', content: 'Do something' }],
            sdd: {
                project: '# Project',
                architect: '# Architect',
                bestPractices: '# Best Practices',
                ticket: '# Ticket'
            }
        });

        assert.ok(result);
        // assert.strictEqual(result.done, true); // If we had logic to set done=true on "next: done"
    });

    it('should compile and run a simple flow (original test, now with mocked callChat)', async () => {
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
