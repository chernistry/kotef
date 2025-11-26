import { describe, it, expect, vi, beforeEach } from 'vitest';
import { researcherNode } from '../../../src/agent/nodes/researcher.js';
import { AgentState } from '../../../src/agent/state.js';
import { KotefConfig } from '../../../src/core/config.js';
import * as deepResearchModule from '../../../src/tools/deep_research.js';
import * as webSearchModule from '../../../src/tools/web_search.js';
import * as llmModule from '../../../src/core/llm.js';
import * as promptsModule from '../../../src/core/prompts.js';

vi.mock('../../../src/tools/deep_research.js');
vi.mock('../../../src/tools/web_search.js');
vi.mock('../../../src/core/llm.js');
vi.mock('../../../src/core/prompts.js');

describe('Researcher Node Integration', () => {
    const mockConfig: KotefConfig = {
        modelFast: 'mock-fast',
        rootDir: '/tmp',
    } as any;

    const baseState: AgentState = {
        messages: [],
        sdd: { goal: 'test goal', project: '', architect: '' },
        taskScope: 'normal',
        runProfile: 'fast',
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(promptsModule, 'loadRuntimePrompt').mockResolvedValue('PROMPT');
        vi.spyOn(llmModule, 'callChat').mockResolvedValue({
            messages: [{ role: 'assistant', content: JSON.stringify({ queries: ['query 1'] }) }]
        } as any);
    });

    it('should use shallow search for tiny scope', async () => {
        const state = { ...baseState, taskScope: 'tiny' as const };
        const node = researcherNode(mockConfig);

        vi.spyOn(webSearchModule, 'webSearch').mockResolvedValue([]);

        await node(state);

        expect(deepResearchModule.deepResearch).not.toHaveBeenCalled();
        expect(webSearchModule.webSearch).toHaveBeenCalled();
    });

    it('should use deep research for large scope', async () => {
        const state = { ...baseState, taskScope: 'large' as const };
        const node = researcherNode(mockConfig);

        vi.spyOn(deepResearchModule, 'deepResearch').mockResolvedValue({ findings: [], quality: null });

        await node(state);

        expect(deepResearchModule.deepResearch).toHaveBeenCalledWith(
            expect.anything(),
            'query 1',
            expect.objectContaining({ taskScope: 'large' })
        );
    });

    it('should use deep research for architecture tasks', async () => {
        const state = { ...baseState, sdd: { ...baseState.sdd, goal: 'design architecture' } };
        const node = researcherNode(mockConfig);

        vi.spyOn(deepResearchModule, 'deepResearch').mockResolvedValue({ findings: [], quality: null });

        await node(state);

        expect(deepResearchModule.deepResearch).toHaveBeenCalledWith(
            expect.anything(),
            'query 1',
            expect.objectContaining({ taskTypeHint: 'architecture' })
        );
    });

    it('should use deep research for strict profile', async () => {
        const state = { ...baseState, runProfile: 'strict' as const };
        const node = researcherNode(mockConfig);

        vi.spyOn(deepResearchModule, 'deepResearch').mockResolvedValue({ findings: [], quality: null });

        await node(state);

        expect(deepResearchModule.deepResearch).toHaveBeenCalled();
    });

    it('should correctly derive debug hint', async () => {
        const state = { ...baseState, sdd: { ...baseState.sdd, goal: 'fix error' }, taskScope: 'large' as const };
        const node = researcherNode(mockConfig);

        vi.spyOn(deepResearchModule, 'deepResearch').mockResolvedValue({ findings: [], quality: null });

        await node(state);

        expect(deepResearchModule.deepResearch).toHaveBeenCalledWith(
            expect.anything(),
            'query 1',
            expect.objectContaining({ taskTypeHint: 'debug' })
        );
    });
});
