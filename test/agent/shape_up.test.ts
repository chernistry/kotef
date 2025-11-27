import { describe, it, expect, vi } from 'vitest';
import { plannerNode } from '../../src/agent/nodes/planner.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';

describe('Shape Up Phase', () => {
    it('should produce a clarified_goal for a vague goal', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'coder',
                    reason: 'Goal clarified',
                    solution_sketch: 'Fix the build',
                    profile: 'fast',
                    plan: [],
                    shaped_goal: {
                        appetite: 'Small',
                        non_goals: [],
                        clarified_intent: 'Fix build errors'
                    },
                    clarified_goal: {
                        functional_outcomes: ['Build passes'],
                        non_functional_risks: ['None'],
                        DoD_checks: ['npm run build'],
                        constraints: []
                    }
                })
            }]
        });

        const config = { rootDir: '/tmp' } as KotefConfig;
        const planner = plannerNode(config, mockChat);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'fix the build',
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

        expect(result.clarified_goal).toBeDefined();
        expect(result.clarified_goal?.functional_outcomes).toContain('Build passes');
        expect(result.clarified_goal?.DoD_checks).toContain('npm run build');
    });
});
