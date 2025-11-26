
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

describe('Deep Research Scoring', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock prompts
        vi.spyOn(promptsModule, 'loadPrompt').mockImplementation(async (name) => {
            if (name === 'search_query_optimizer') return 'OPTIMIZER PROMPT';
            if (name === 'research_query_refiner') return 'REFINER PROMPT';
            if (name === 'research_relevance_evaluator') return 'EVALUATOR PROMPT';
            return '';
        });

        // Mock web search
        vi.spyOn(webSearchModule, 'webSearch').mockResolvedValue([
            { url: 'https://example.com/1', title: 'Result 1', snippet: 'Snippet 1', source: 'tavily' }
        ]);

        // Mock fetch page
        vi.spyOn(fetchPageModule, 'fetchPage').mockResolvedValue({
            content: 'Mock content',
            title: 'Mock Title',
            url: 'http://mock.url',
            status: 200
        });
    });

    it('should parse new scoring fields', async () => {
        // Optimizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ query: 'optimized' }) }]
        } as any);

        // Summarizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify([{ statement: 'finding', citations: [] }]) }]
        } as any);

        // Evaluator with new fields
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{
                role: 'assistant', content: JSON.stringify({
                    relevance: 0.9,
                    confidence: 0.8,
                    coverage: 0.7,
                    support: 0.85,
                    recency: 0.95,
                    diversity: 0.6,
                    hasConflicts: false,
                    should_retry: false,
                    reasons: 'Good'
                })
            }]
        } as any);

        const result = await deepResearch(mockConfig, 'goal');

        expect(result.quality).toBeDefined();
        expect(result.quality?.support).toBe(0.85);
        expect(result.quality?.recency).toBe(0.95);
        expect(result.quality?.diversity).toBe(0.6);
        expect(result.quality?.hasConflicts).toBe(false);
    });

    it('should handle missing new fields gracefully', async () => {
        // Optimizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify({ query: 'optimized' }) }]
        } as any);

        // Summarizer
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{ role: 'assistant', content: JSON.stringify([{ statement: 'finding', citations: [] }]) }]
        } as any);

        // Evaluator with OLD fields only
        vi.spyOn(llmModule, 'callChat').mockResolvedValueOnce({
            messages: [{
                role: 'assistant', content: JSON.stringify({
                    relevance: 0.9,
                    confidence: 0.8,
                    coverage: 0.7,
                    should_retry: false
                })
            }]
        } as any);

        const result = await deepResearch(mockConfig, 'goal');

        expect(result.quality).toBeDefined();
        expect(result.quality?.support).toBe(0.5); // Default
        expect(result.quality?.recency).toBe(0.5); // Default
        expect(result.quality?.hasConflicts).toBe(false); // Default
    });
});
