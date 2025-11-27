import { describe, it, expect, vi } from 'vitest';
import { researcherNode } from '../../src/agent/nodes/researcher.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';
import { analyzeImpact } from '../../src/agent/utils/impact.js';

// Mock dependencies
vi.mock('../../src/core/llm.js', () => ({
    callChat: vi.fn().mockResolvedValue({
        messages: [{
            content: JSON.stringify({
                queries: ['test query'],
                findings: [],
                impact_map: { files: ['src/test.ts'], modules: ['test'] },
                risk_map: { level: 'low', factors: [], hotspots: [] },
                ready_for_coder: true,
                reason: 'Analysis complete'
            })
        }]
    })
}));

vi.mock('../../src/agent/utils/impact', () => ({
    analyzeImpact: vi.fn().mockResolvedValue({
        impactMap: { files: ['src/test.ts'], modules: ['test'] },
        riskMap: { level: 'low', factors: [], hotspots: [] }
    })
}));

vi.mock('../../src/tools/web_search', () => ({
    webSearch: vi.fn().mockResolvedValue([])
}));

describe('Analyze Phase', () => {
    it('should perform impact analysis and return impact_map', async () => {
        const config = { rootDir: '/tmp', modelFast: 'gpt-4o-mini' } as KotefConfig;
        const researcher = researcherNode(config);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'update test',
                project: 'Test Project',
                architect: 'Test Architect'
            },
            clarified_goal: {
                functional_outcomes: ['Update test logic'],
                non_functional_risks: [],
                DoD_checks: [],
                constraints: []
            },
            loopCounters: {
                planner_to_researcher: 0,
                planner_to_verifier: 0,
                planner_to_coder: 0
            },
            totalSteps: 0,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        const result = await researcher(initialState);

        expect(analyzeImpact).toHaveBeenCalled();
        expect(result.impactMap).toBeDefined();
        expect(result.impactMap?.files).toContain('src/test.ts');
        expect(result.riskMap).toBeDefined();
    });
});
