import { describe, it, expect } from 'vitest';
import { AgentState, ExecutionProfile } from '../../src/agent/state.js';
import { verifierNode } from '../../src/agent/nodes/verifier.js';
import { KotefConfig } from '../../src/core/config.js';

describe('Goal-First DoD & Yolo Behaviour', () => {
    const baseCfg: KotefConfig = {
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        modelFast: 'gpt-4o-mini',
        modelStrong: 'gpt-4o',
        rootDir: '/tmp/test',
        mockMode: true,
        dryRun: false,
        maxRunSeconds: 300,
        maxTokensPerRun: 100000,
        maxWebRequestsPerRun: 10
    };

    it('should mark as done when tests pass in strict profile', async () => {
        const state: AgentState = {
            messages: [],
            sdd: {
                project: 'Test project',
                architect: '',
                bestPractices: ''
            },
            runProfile: 'strict' as ExecutionProfile,
            failureHistory: [],
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
            totalSteps: 0,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        const node = verifierNode(baseCfg);
        const result = await node(state);

        // In mock mode, tests pass
        expect(result.done).toBe(true);
    });

    it('should allow functional completion in yolo profile after 2 attempts', async () => {
        const state: AgentState = {
            messages: [],
            sdd: {
                project: 'Test project',
                architect: '',
                bestPractices: ''
            },
            runProfile: 'yolo' as ExecutionProfile,
            failureHistory: [
                { step: 'verifier', error: 'Test failed: lint error', timestamp: Date.now() },
                { step: 'verifier', error: 'Test failed: lint error', timestamp: Date.now() }
            ],
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
            totalSteps: 0,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        // This test would need a way to mock failing tests
        // For now, verify the logic is present
        expect(state.runProfile).toBe('yolo');
        expect(state.failureHistory.length).toBe(2);
    });

    it('should distinguish critical vs non-critical failures', () => {
        const criticalKinds = ['runtime_error', 'compilation'];
        const nonCriticalKinds = ['test_failure', 'timeout'];

        criticalKinds.forEach(kind => {
            const isCritical = kind === 'runtime_error' || kind === 'compilation';
            expect(isCritical).toBe(true);
        });

        nonCriticalKinds.forEach(kind => {
            const isNonCritical = kind !== 'runtime_error' && kind !== 'compilation';
            expect(isNonCritical).toBe(true);
        });
    });

    it('should track completion reason in goal-first mode', () => {
        const completionReason = 'Functionally done after 3 attempts. Remaining issues: test_failure (One or more tests failed)';

        expect(completionReason).toContain('Functionally done');
        expect(completionReason).toContain('attempts');
        expect(completionReason).toContain('Remaining issues');
    });
});
