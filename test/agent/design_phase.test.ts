import { describe, it, expect, vi } from 'vitest';
import { plannerNode } from '../../src/agent/nodes/planner.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';
import { appendAdr } from '../../src/agent/utils/adr.js';

// Mock dependencies
vi.mock('../../src/agent/utils/adr', () => ({
    appendAdr: vi.fn().mockResolvedValue('/path/to/ADR-001-test.md'),
    syncAssumptions: vi.fn().mockResolvedValue(undefined)
}));

describe('Design Phase', () => {
    it('should generate ADR when planner decides to make a design decision', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'coder',
                    reason: 'Design decision made',
                    solution_sketch: 'Migrate DB',
                    profile: 'fast',
                    plan: [],
                    designDecisions: [{
                        title: 'Use Postgres',
                        context: 'Need better concurrency',
                        decision: 'Migrate from SQLite to Postgres',
                        alternatives: ['MySQL'],
                        consequences: ['Need new driver']
                    }]
                })
            }]
        });

        const config = { rootDir: '/tmp' } as KotefConfig;
        const planner = plannerNode(config, mockChat);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'migrate db',
                project: 'Test Project',
                architect: 'Test Architect'
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

        const result = await planner(initialState);

        expect(appendAdr).toHaveBeenCalled();
        expect(result.designDecisions).toBeDefined();
        expect(result.designDecisions?.[0].title).toBe('Use Postgres');
    });
});

