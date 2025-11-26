import { describe, it, expect } from 'vitest';
import { computeResearchStrategy, DeepResearchOptions } from '../../src/tools/deep_research.js';

describe('Research Strategy Logic', () => {
    const goal = 'test goal';

    it('should use medium strategy by default', () => {
        const strategy = computeResearchStrategy(goal, {});
        expect(strategy).toEqual({
            level: 'medium',
            maxAttempts: 3,
            maxResults: 5,
            topPages: 3,
            searchDepth: 'basic'
        });
    });

    it('should use shallow strategy for tiny scope', () => {
        const options: DeepResearchOptions = { taskScope: 'tiny' };
        const strategy = computeResearchStrategy(goal, options);
        expect(strategy).toEqual({
            level: 'shallow',
            maxAttempts: 1,
            maxResults: 3,
            topPages: 1,
            searchDepth: 'basic'
        });
    });

    it('should use deep strategy for large scope', () => {
        const options: DeepResearchOptions = { taskScope: 'large' };
        const strategy = computeResearchStrategy(goal, options);
        expect(strategy).toEqual({
            level: 'deep',
            maxAttempts: 4,
            maxResults: 7,
            topPages: 5,
            searchDepth: 'advanced'
        });
    });

    it('should use deep strategy for architecture type', () => {
        const options: DeepResearchOptions = { taskTypeHint: 'architecture' };
        const strategy = computeResearchStrategy(goal, options);
        expect(strategy.level).toBe('deep');
        expect(strategy.searchDepth).toBe('advanced');
    });

    it('should respect maxAttempts override', () => {
        const options: DeepResearchOptions = { maxAttempts: 10 };
        const strategy = computeResearchStrategy(goal, options);
        expect(strategy.maxAttempts).toBe(10);
        // Other defaults should remain medium
        expect(strategy.level).toBe('medium');
    });

    it('should respect maxAttempts override even with tiny scope', () => {
        const options: DeepResearchOptions = { taskScope: 'tiny', maxAttempts: 5 };
        const strategy = computeResearchStrategy(goal, options);
        expect(strategy.maxAttempts).toBe(5);
        expect(strategy.level).toBe('shallow');
    });

    it('should use medium strategy for reference type (default)', () => {
        const options: DeepResearchOptions = { taskTypeHint: 'reference' };
        const strategy = computeResearchStrategy(goal, options);
        // Reference type doesn't trigger deep search - uses default medium
        expect(strategy.level).toBe('medium');
        expect(strategy.searchDepth).toBe('basic');
    });

    it('should use medium strategy for debug type (default)', () => {
        const options: DeepResearchOptions = { taskTypeHint: 'debug' };
        const strategy = computeResearchStrategy(goal, options);
        // Debug type doesn't trigger deep search - uses default medium
        expect(strategy.level).toBe('medium');
        expect(strategy.searchDepth).toBe('basic');
    });

    it('should use deep strategy for research type', () => {
        const options: DeepResearchOptions = { taskTypeHint: 'research' };
        const strategy = computeResearchStrategy(goal, options);
        expect(strategy.level).toBe('deep');
        expect(strategy.searchDepth).toBe('advanced');
    });
});
