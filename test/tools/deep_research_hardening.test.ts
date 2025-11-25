import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deepResearch } from '../../src/tools/deep_research.js';
import * as webSearchModule from '../../src/tools/web_search.js';
import * as llmModule from '../../src/core/llm.js';
import { KotefConfig } from '../../src/core/config.js';

describe('Deep Research Hardening', () => {
    const mockConfig: KotefConfig = {
        modelFast: 'mock-fast',
        modelSmart: 'mock-smart',
        rootDir: '/tmp',
        mockMode: false,
    } as any;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should return empty array and not throw if webSearch fails completely', async () => {
        // Mock webSearch to throw
        vi.spyOn(webSearchModule, 'webSearch').mockRejectedValue(new Error('Tavily Down'));

        // Mock logger to avoid clutter
        // (Assuming logger is created inside, we might see console output, which is fine)

        const result = await deepResearch(mockConfig, 'test query', { maxAttempts: 1 });
        expect(result.findings).toEqual([]);
    });

    it('should retry if quality is low and maxAttempts > 1', async () => {
        // 1. Mock webSearch to return results
        const webSearchSpy = vi.spyOn(webSearchModule, 'webSearch').mockResolvedValue([
            { title: 'Result', url: 'http://example.com', source: 'tavily', snippet: 'content' }
        ]);

        // 2. Mock fetchPage
        vi.mock('../../src/tools/fetch_page.js', () => ({
            fetchPage: vi.fn().mockResolvedValue({ content: 'Page content' })
        }));

        // 3. Mock callChat to handle the sequence of LLM calls
        // Sequence:
        // 1. summarizeFindings (Attempt 1)
        // 2. scoreResearchAttempt (Attempt 1) -> Low Quality
        // 3. refineResearchQuery (Attempt 1) -> New Query
        // 4. summarizeFindings (Attempt 2)
        // 5. scoreResearchAttempt (Attempt 2) -> High Quality

        const callChatSpy = vi.spyOn(llmModule, 'callChat');

        callChatSpy
            // Attempt 1: Summarize
            .mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: JSON.stringify([{ statement: 'Fact 1', citations: [] }]) }]
            } as any)
            // Attempt 1: Score (Low Quality)
            .mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: JSON.stringify({ relevance: 0.1, coverage: 0.1, confidence: 0.1, shouldRetry: true, reasons: 'Bad' }) }]
            } as any)
            // Attempt 1: Refine
            .mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: 'refined query' }]
            } as any)
            // Attempt 2: Summarize
            .mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: JSON.stringify([{ statement: 'Fact 2', citations: [] }]) }]
            } as any)
            // Attempt 2: Score (High Quality)
            .mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: JSON.stringify({ relevance: 0.9, coverage: 0.9, confidence: 0.9, shouldRetry: false, reasons: 'Good' }) }]
            } as any);

        const result = await deepResearch(mockConfig, 'initial query', { maxAttempts: 2 });

        // Verify webSearch was called twice
        expect(webSearchSpy).toHaveBeenCalledTimes(2);
        expect(webSearchSpy).toHaveBeenNthCalledWith(1, expect.anything(), 'initial query', expect.anything());
        expect(webSearchSpy).toHaveBeenNthCalledWith(2, expect.anything(), 'refined query', expect.anything());

        // Verify findings returned are from the best attempt (Attempt 2 has high score)
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].statement).toBe('Fact 2');
        expect(result.quality?.relevance).toBe(0.9);
    });
});
