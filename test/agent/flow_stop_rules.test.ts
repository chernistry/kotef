
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
        state.loopCounters.planner_to_researcher = 5; // At threshold (will be 6 > 5 after increment)
        // Set lastResearchSignature to prevent reset
        state.loopCounters.lastResearchSignature = JSON.stringify({ lastQuery: undefined, length: 0 }).slice(0, 256);

        // Mock LLM to propose 'researcher' again (this will increment to 6 > 5)
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
        expect(result.plan?.reason).toContain('planner→researcher');
    });

    it('should abort if planner->verifier loop limit is exceeded', async () => {
        state.loopCounters.planner_to_verifier = 5; // At threshold

        // Mock LLM to propose 'verifier' again (this will increment to 6 > 5)
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
        expect(result.plan?.reason).toContain('planner→verifier without progress');
    });

    it('should allow normal flow if limits are not exceeded', async () => {
        state.loopCounters.planner_to_researcher = 0;

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
        expect(result.loopCounters?.planner_to_researcher).toBe(1);
    });

    it('should accept done_partial when functional goal is met in non-strict profile', async () => {
        state.runProfile = 'fast';
        // Only 2 failures to avoid MAX_FAILURES (3) check
        state.failureHistory = [
            { step: 'verifier', error: 'lint warning: unused variable', timestamp: Date.now() - 1000 },
            { step: 'verifier', error: 'lint warning: unused variable', timestamp: Date.now() }
        ];
        state.functionalChecks = [
            { command: 'npm run dev', exitCode: 0, timestamp: Date.now(), node: 'coder' }
        ];
        state.testResults = { passed: false, message: 'Some lint warnings remain' };

        // Mock LLM to propose done_partial
        mockChatFn.mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'done',
                    terminalStatus: 'done_partial',
                    reason: 'Functional goal met (app runs), but minor lint warnings remain',
                    profile: 'fast',
                    plan: []
                })
            }]
        });

        const node = plannerNode(mockConfig, mockChatFn);
        const result = await node(state);

        expect(result.terminalStatus).toBe('done_partial');
        // Planner doesn't set done:true - that's handled by the graph router
        expect(result.plan?.next).toBe('done');
    });
});

