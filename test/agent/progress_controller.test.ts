import { describe, it, expect } from 'vitest';
import { makeSnapshot, assessProgress, ProgressSnapshot } from '../../src/agent/utils/progress_controller.js';
import { AgentState } from '../../src/agent/state.js';

describe('Progress Controller', () => {
    it('should create a snapshot from state', () => {
        const state: Partial<AgentState> = {
            fileChanges: { 'src/foo.ts': 'modified' },
            sameErrorCount: 0,
            lastTestSignature: 'test-sig-123',
            functionalChecks: [{ command: 'npm run dev', exitCode: 0, timestamp: Date.now(), node: 'coder' }]
        };

        const snapshot = makeSnapshot(state as AgentState, 'coder');

        expect(snapshot.node).toBe('coder');
        expect(snapshot.fileChangeCount).toBe(1);
        expect(snapshot.sameErrorCount).toBe(0);
        expect(snapshot.lastTestSignature).toBe('test-sig-123');
        expect(snapshot.functionalChecksCount).toBe(1);
    });

    it('should detect no progress when snapshots are identical', () => {
        const snapshot1: ProgressSnapshot = {
            node: 'verifier',
            fileChangeCount: 1,
            sameErrorCount: 2,
            lastTestSignature: 'sig-abc',
            functionalChecksCount: 0,
            timestamp: Date.now()
        };

        const snapshot2 = { ...snapshot1, timestamp: Date.now() + 1000 };
        const snapshot3 = { ...snapshot1, timestamp: Date.now() + 2000 };

        const history = [snapshot1, snapshot2, snapshot3];
        const assessment = assessProgress(history, 3);

        expect(assessment.status).toBe('stuck_candidate');
        expect(assessment.reason).toContain('State has not changed for 3 steps');
    });

    it('should allow progress when snapshots change', () => {
        const snapshot1: ProgressSnapshot = {
            node: 'verifier',
            fileChangeCount: 1,
            sameErrorCount: 0,
            lastTestSignature: 'sig-1',
            functionalChecksCount: 0,
            timestamp: Date.now()
        };

        const snapshot2 = { ...snapshot1, fileChangeCount: 2, timestamp: Date.now() + 1000 };
        const snapshot3 = { ...snapshot2, sameErrorCount: 1, timestamp: Date.now() + 2000 };

        const history = [snapshot1, snapshot2, snapshot3];
        const assessment = assessProgress(history, 3);

        expect(assessment.status).toBe('ok');
    });

    it('should return ok when history is shorter than threshold', () => {
        const snapshot1: ProgressSnapshot = {
            node: 'coder',
            fileChangeCount: 1,
            sameErrorCount: 0,
            functionalChecksCount: 0,
            timestamp: Date.now()
        };

        const history = [snapshot1, snapshot1];
        const assessment = assessProgress(history, 3);

        expect(assessment.status).toBe('ok');
    });

    it('should detect stuck state with different nodes but same metrics', () => {
        const snapshot1: ProgressSnapshot = {
            node: 'planner',
            fileChangeCount: 1,
            sameErrorCount: 2,
            functionalChecksCount: 0,
            timestamp: Date.now()
        };

        // Even if the node is the same, if all other metrics match, it's stuck
        const snapshot2 = { ...snapshot1, timestamp: Date.now() + 1000 };
        const snapshot3 = { ...snapshot1, timestamp: Date.now() + 2000 };

        const history = [snapshot1, snapshot2, snapshot3];
        const assessment = assessProgress(history, 3);

        expect(assessment.status).toBe('stuck_candidate');
    });
});
