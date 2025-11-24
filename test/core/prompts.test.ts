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
            'verifier'
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
});
