import { describe, it, expect, vi } from 'vitest';
import { plannerNode } from '../../src/agent/nodes/planner';
import { AgentState } from '../../src/agent/state';
import { KotefConfig } from '../../src/core/config';

describe('Work Planning Phase', () => {
    it('should parse work_plan and budget_allocation from planner response', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'coder',
                    reason: 'Plan created',
                    solution_sketch: 'Do work',
                    profile: 'fast',
                    plan: [],
                    work_plan: [
                        { id: '1', owner: 'coder', action: 'edit', detail: 'file.ts', budget_estimate: 'low' }
                    ],
                    budget_allocation: {
                        total_steps: 1,
                        per_step: { '1': 5 }
                    }
                })
            }]
        });

        const config = { rootDir: '/tmp' } as KotefConfig;
        const planner = plannerNode(config, mockChat);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'do work',
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

        expect(result.work_plan).toBeDefined();
        expect(result.work_plan?.[0].budget_estimate).toBe('low');
        expect(result.budget_allocation).toBeDefined();
        expect(result.budget_allocation?.total_steps).toBe(1);
    });
});
