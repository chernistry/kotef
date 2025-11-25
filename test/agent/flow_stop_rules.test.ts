
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { plannerNode } from '../../src/agent/nodes/planner.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';

// Mock dependencies
const mockConfig: KotefConfig = {
    rootDir: '/tmp/test',
    modelFast: 'mock-fast',
    modelStrong: 'mock-strong',
    maxRunSeconds: 60,
    maxTokensPerRun: 1000,
    dryRun: true
};

const mockChatFn = vi.fn();

describe('Agent Flow & Stop Rules', () => {
    let state: AgentState;

    beforeEach(() => {
        vi.clearAllMocks();
        state = {
            messages: [],
            sdd: {
                project: 'Test Project',
                architect: 'Test Arch',
                bestPractices: 'Test BP',
                goal: 'Test Goal'
            },
            hasSdd: true,
            runProfile: 'fast',
            fileChanges: {},
            testResults: {},
            researchResults: [],
            loopCounters: {
                planner_to_researcher: 0,
                planner_to_verifier: 0,
                planner_to_coder: 0
            },
            totalSteps: 0,
            consecutiveNoOps: 0,
            sameErrorCount: 0,
            failureHistory: []
        };
    });

    it('should abort if MAX_STEPS is exceeded', async () => {
        state.totalSteps = 50; // Threshold is 50

        const node = plannerNode(mockConfig, mockChatFn);
        const result = await node(state);

        expect(result.terminalStatus).toBe('aborted_stuck');
        expect(result.plan?.next).toBe('snitch');
        expect(result.plan?.reason).toContain('Max steps limit reached');
    });

    it('should abort if planner->researcher loop limit is exceeded', async () => {
        state.loopCounters.planner_to_researcher = 6; // Threshold is 5

        // Mock LLM to propose 'researcher' again
        mockChatFn.mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'researcher',
                    reason: 'Need more research',
                    profile: 'fast',
                    plan: []
                })
            }]
        });

        const node = plannerNode(mockConfig, mockChatFn);
        const result = await node(state);

        expect(result.terminalStatus).toBe('aborted_stuck');
        expect(result.plan?.next).toBe('snitch');
        expect(result.plan?.reason).toContain('Planner->Researcher loop limit exceeded');
    });

    it('should abort if planner->verifier loop limit is exceeded', async () => {
        state.loopCounters.planner_to_verifier = 6; // Threshold is 5

        // Mock LLM to propose 'verifier' again
        mockChatFn.mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'verifier',
                    reason: 'Verify again',
                    profile: 'fast',
                    plan: []
                })
            }]
        });

        const node = plannerNode(mockConfig, mockChatFn);
        const result = await node(state);

        expect(result.terminalStatus).toBe('aborted_stuck');
        expect(result.plan?.next).toBe('snitch');
        expect(result.plan?.reason).toContain('Planner->Verifier loop limit exceeded');
    });

    it('should allow normal flow if limits are not exceeded', async () => {
        state.loopCounters.planner_to_researcher = 2;

        mockChatFn.mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'researcher',
                    reason: 'More research needed',
                    profile: 'fast',
                    plan: []
                })
            }]
        });

        const node = plannerNode(mockConfig, mockChatFn);
        const result = await node(state);

        expect(result.terminalStatus).toBeUndefined();
        expect(result.plan?.next).toBe('researcher');
        expect(result.loopCounters?.planner_to_researcher).toBe(3);
    });
});
