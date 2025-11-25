import { afterEach, describe, it, expect } from 'vitest';
import {
    clearPromptCache,
    loadRuntimePrompt
} from '../../src/core/prompts.js';

describe('Runtime prompts', () => {
    afterEach(() => clearPromptCache());

    it('should load all runtime prompts', async () => {
        const prompts = [
            'meta_agent',
            'planner',
            'researcher',
            'coder',
            'verifier',
            'research_query_refiner',
            'research_relevance_evaluator',
            'search_query_optimizer'
        ] as const;

        for (const promptName of prompts) {
            const content = await loadRuntimePrompt(promptName);
            expect(content).toBeTruthy();
            expect(content.length).toBeGreaterThan(0);
        }
    });

    it('throws on unknown runtime prompt', async () => {
        await expect(loadRuntimePrompt('unknown_prompt' as any)).rejects.toThrow(/Unknown runtime prompt/);
    });

    it('planner exposes a valid JSON schema block', async () => {
        const content = await loadRuntimePrompt('planner');
        expect(content).toContain('# Output format (must strictly match schema)');
        expect(content).toContain('{');
    });

    it('researcher prompt includes web search instructions', async () => {
        const content = await loadRuntimePrompt('researcher');
        expect(content).toContain('# Role');
        expect(content).toContain('Researcher');
    });

    it('core agent prompts enforce JSON-only outputs', async () => {
        const coder = await loadRuntimePrompt('coder');
        expect(coder).toMatch(/single JSON object/i);

        const planner = await loadRuntimePrompt('planner');
        expect(planner).toMatch(/single JSON object/i);

        const researcher = await loadRuntimePrompt('researcher');
        expect(researcher).toMatch(/single JSON object/i);

        const verifier = await loadRuntimePrompt('verifier');
        expect(verifier).toMatch(/single JSON object/i);
    });

    it('research helper prompts describe JSON contracts', async () => {
        const refiner = await loadRuntimePrompt('research_query_refiner');
        expect(refiner).toMatch(/single JSON object/i);

        const relevance = await loadRuntimePrompt('research_relevance_evaluator');
        expect(relevance).toMatch(/single JSON object/i);

        const optimizer = await loadRuntimePrompt('search_query_optimizer');
        expect(optimizer).toMatch(/single JSON object/i);
    });
});
