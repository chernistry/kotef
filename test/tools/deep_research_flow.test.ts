
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deepResearch } from '../../src/tools/deep_research.js';
import { KotefConfig } from '../../src/core/config.js';
import * as webSearchModule from '../../src/tools/web_search.js';
import * as fetchPageModule from '../../src/tools/fetch_page.js';
import * as llmModule from '../../src/core/llm.js';
import * as promptsModule from '../../src/core/prompts.js';

// Mock dependencies
const mockConfig: KotefConfig = {
    rootDir: '/tmp/test',
    modelFast: 'mock-fast',
    modelStrong: 'mock-strong',
    maxRunSeconds: 60,
    maxTokensPerRun: 1000,
    dryRun: true
};

vi.mock('../../src/tools/web_search.js');
vi.mock('../../src/tools/fetch_page.js');
vi.mock('../../src/core/llm.js');
vi.mock('../../src/core/prompts.js');

describe('Deep Research Flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock prompts
        vi.spyOn(promptsModule, 'loadPrompt').mockImplementation(async (name) => {
            if (name === 'search_query_optimizer') return 'OPTIMIZER PROMPT {{GOAL}}';
            if (name === 'research_query_refiner') return 'REFINER PROMPT {{PREVIOUS_QUERY}}';
            if (name === 'research_relevance_evaluator') return 'EVALUATOR PROMPT {{QUERY}}';
            return '';
        });

        // Mock web search
        vi.spyOn(webSearchModule, 'webSearch').mockResolvedValue([
            { url: 'https://example.com/1', title: 'Result 1', snippet: 'Snippet 1', source: 'tavily' },
            { url: 'https://example.com/2', title: 'Result 2', snippet: 'Snippet 2', source: 'tavily' }
        ]);

        // Mock fetch page
        vi.spyOn(fetchPageModule, 'fetchPage').mockResolvedValue({
            content: 'Mock page content',
            title: 'Mock Title',
            url: 'http://mock.url',
            status: 200
        });
    });

    it('should optimize initial query', async () => {
        // Mock LLM for optimizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ query: 'optimized query', reason: 'better' }) }]
        } as any);

        // Mock LLM for summarizer (called inside deepResearch)
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify([{ statement: 'finding', citations: [] }]) }]
        } as any);

        // Mock LLM for evaluator
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ relevance: 0.8, coverage: 0.8, should_retry: false }) }]
        } as any);

        const result = await deepResearch(mockConfig, 'original goal');

        expect(result.quality?.lastQuery).toBe('optimized query');
        expect(webSearchModule.webSearch).toHaveBeenCalledWith(expect.anything(), 'optimized query', expect.anything());
    });

    it('should retry if quality is low', async () => {
        // Mock LLM for optimizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ query: 'query 1', reason: 'initial' }) }]
        } as any);

        // ATTEMPT 1
        // Summarizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify([{ statement: 'finding 1', citations: [] }]) }]
        } as any);
        // Evaluator (Low quality)
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ relevance: 0.2, coverage: 0.2, should_retry: true }) }]
        } as any);
        // Refiner
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ query: 'query 2', should_retry: true }) }]
        } as any);

        // ATTEMPT 2
        // Summarizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify([{ statement: 'finding 2', citations: [] }]) }]
        } as any);
        // Evaluator (High quality)
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ relevance: 0.9, coverage: 0.9, should_retry: false }) }]
        } as any);

        const result = await deepResearch(mockConfig, 'goal', { maxAttempts: 2 });

        expect(result.quality?.lastQuery).toBe('query 2');
        expect(result.quality?.relevance).toBe(0.9);
        expect(webSearchModule.webSearch).toHaveBeenCalledTimes(2);
    });

    it('should respect max attempts', async () => {
        // Mock optimizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ query: 'query 1' }) }]
        } as any);

        // Loop mocks for 2 attempts (both low quality)
        for (let i = 0; i < 2; i++) {
            // Summarizer
            vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: JSON.stringify([]) }]
            } as any);
            // Evaluator
            vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: JSON.stringify({ relevance: 0.1, should_retry: true }) }]
            } as any);
            // Refiner (only called if not last attempt)
            if (i < 1) {
                vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
                    messages: [{ role: 'assistant', content: JSON.stringify({ query: 'query 2', should_retry: true }) }]
                } as any);
            }
        }

        const result = await deepResearch(mockConfig, 'goal', { maxAttempts: 2 });

        expect(webSearchModule.webSearch).toHaveBeenCalledTimes(2);
        // Should return best of bad attempts (or last)
        expect(result.quality).not.toBeNull();
    });
    it('should return raw data for persistence', async () => {
        // Mock optimizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ query: 'optimized query' }) }]
        } as any);

        // Mock summarizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify([{ statement: 'finding', citations: [] }]) }]
        } as any);

        // Mock evaluator
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ relevance: 0.9, coverage: 0.9, should_retry: false }) }]
        } as any);

        const result = await deepResearch(mockConfig, 'goal');

        expect(result.rawSearchResults).toBeDefined();
        expect(result.rawSearchResults?.length).toBeGreaterThan(0);
        expect(result.rawPagesSample).toBeDefined();
        expect(result.rawPagesSample?.length).toBeGreaterThan(0);
        expect(result.rawPagesSample?.[0].content).toContain('Mock page content');
    });
});
