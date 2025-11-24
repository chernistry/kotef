import { afterEach, describe, it, expect } from 'vitest';
import {
    clearPromptCache,
    loadRuntimePrompt,
    RuntimePromptName
} from '../../src/core/prompts.js';

const runtimePrompts: RuntimePromptName[] = [
    'meta_agent',
    'planner',
    'researcher',
    'coder',
    'verifier'
];

describe('Runtime prompts', () => {
    afterEach(() => clearPromptCache());

    it('loads all runtime prompts with content', async () => {
        for (const name of runtimePrompts) {
            const prompt = await loadRuntimePrompt(name);
            assert.ok(prompt.length > 20, `Prompt ${name} should not be empty`);
        }
    });

    it('throws on unknown runtime prompt', async () => {
        await expect(loadRuntimePrompt('unknown_prompt' as any)).rejects.toThrow(/Unknown runtime prompt/);
    });

    it('planner exposes a valid JSON schema block', async () => {
        const prompt = await loadRuntimePrompt('planner');
        const match = prompt.match(/```json\n([\s\S] *?)```/);
        assert.ok(match, 'Planner prompt must contain a JSON schema block');
        const parsed = JSON.parse(match[1]);
        assert.ok(Array.isArray(parsed.properties.next.enum));
        assert.ok(parsed.properties.next.enum.includes('coder'));
    });
});
