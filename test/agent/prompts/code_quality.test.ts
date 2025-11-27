import { describe, it, expect } from 'vitest';
import { loadRuntimePrompt, loadPrompt } from '../../../src/core/prompts.js';

describe('Code Quality Prompts', () => {
    it('sdd_summary_best_practices should contain Senior Patterns', async () => {
        const prompt = await loadRuntimePrompt('sdd_summary_best_practices');

        expect(prompt).toContain('Senior Patterns');
        expect(prompt).toContain('Feature-folder or layered architecture');
        expect(prompt).toContain('design tokens/CSS variables');
        expect(prompt).toContain('Mandatory Error Boundaries');
    });

    it('coder prompt should contain Code Quality Standards', async () => {
        const prompt = await loadRuntimePrompt('coder');

        expect(prompt).toContain('Code Quality Standards (Senior Level)');
        expect(prompt).toContain('Refuse to create flat file structures');
        expect(prompt).toContain('Do NOT use hardcoded hex/rgb values');
        expect(prompt).toContain('Ensure the application root is wrapped in an Error Boundary');
    });
});
