import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transitionPhase, getPhaseDuration } from '../../src/agent/utils/phase_tracker.js';
import { AgentState } from '../../src/agent/state.js';

describe('Phase Tracker', () => {
    let state: AgentState;

    beforeEach(() => {
        state = {
            messages: [],
            sdd: { project: '', architect: '' },
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0, sameErrorCount: 0 },
            totalSteps: 0,
            sameErrorCount: 0
        };
    });

    it('should transition to a new phase', () => {
        const updates = transitionPhase(state, 'understand_goal');

        expect(updates.currentPhase).toBe('understand_goal');
        expect(updates.phaseHistory).toHaveLength(1);
        expect(updates.phaseHistory![0].phase).toBe('understand_goal');
        expect(updates.phaseHistory![0].startedAt).toBeDefined();
        expect(updates.phaseHistory![0].endedAt).toBeUndefined();
    });

    it('should close the previous phase', async () => {
        // Start first phase
        const update1 = transitionPhase(state, 'understand_goal');
        state = { ...state, ...update1 };

        // Wait a bit (mock time would be better but this is simple enough)
        await new Promise(r => setTimeout(r, 10));

        // Transition to second phase
        const update2 = transitionPhase(state, 'plan_work', 'Goal understood');
        state = { ...state, ...update2 };

        expect(state.phaseHistory).toHaveLength(2);

        const first = state.phaseHistory![0];
        const second = state.phaseHistory![1];

        expect(first.phase).toBe('understand_goal');
        expect(first.endedAt).toBeDefined();
        expect(first.summary).toBe('Goal understood');
        expect(first.endedAt).toBeGreaterThanOrEqual(first.startedAt);

        expect(second.phase).toBe('plan_work');
        expect(second.startedAt).toBeDefined();
        expect(second.endedAt).toBeUndefined();
    });

    it('should not add duplicate phase entries if staying in same phase', () => {
        const update1 = transitionPhase(state, 'implement');
        state = { ...state, ...update1 };

        const update2 = transitionPhase(state, 'implement');

        expect(update2).toEqual({});
        expect(state.phaseHistory).toHaveLength(1);
    });

    it('should calculate duration', async () => {
        const update1 = transitionPhase(state, 'verify');
        state = { ...state, ...update1 };

        await new Promise(r => setTimeout(r, 50));

        const update2 = transitionPhase(state, 'retro');
        state = { ...state, ...update2 };

        const duration = getPhaseDuration(state.phaseHistory![0]);
        expect(duration).toBeGreaterThan(0.04); // > 40ms
        expect(duration).toBeLessThan(0.2); // < 200ms
    });
});
