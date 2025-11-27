import { describe, it, expect } from 'vitest';
import { loadRuntimePrompt } from '../../../src/core/prompts.js';

describe('Orchestrator Tickets Prompt', () => {
    it('should contain mandatory rules for Git and Testing', async () => {
        const prompt = await loadRuntimePrompt('orchestrator_tickets');

        expect(prompt).toContain('Mandatory Rules for Content');
        expect(prompt).toContain('Commit changes to git with a descriptive message');
        expect(prompt).toContain('Configure test harness');
    });
});
