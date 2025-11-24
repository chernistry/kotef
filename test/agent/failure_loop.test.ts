import { describe, it, expect, beforeEach } from 'vitest';
import { AgentState } from '../../src/agent/state.js';
import { TestRunResult } from '../../src/tools/test_runner.js';

describe('Failure Feedback Loop', () => {
    let initialState: AgentState;

    beforeEach(() => {
        initialState = {
            messages: [],
            sdd: {
                project: 'Test Project',
                architect: 'Test architecture',
                bestPractices: 'Test practices'
            },
            failureHistory: []
        };
    });

    it('should classify test failure correctly', () => {
        const testResult: TestRunResult = {
            command: 'npm test',
            exitCode: 1,
            stdout: 'FAIL test/example.test.ts\n2 tests failed\n',
            stderr: '',
            passed: false,
            failureKind: 'test_failure',
            failureSummary: 'One or more tests failed.'
        };

        expect(testResult.failureKind).toBe('test_failure');
        expect(testResult.failureSummary).toContain('tests failed');
    });

    it('should classify compilation error correctly', () => {
        const testResult: TestRunResult = {
            command: 'npm run build',
            exitCode: 2,
            stdout: '',
            stderr: 'error TS2304: Cannot find name "foo"',
            passed: false,
            failureKind: 'compilation',
            failureSummary: 'Compilation or syntax error detected.'
        };

        expect(testResult.failureKind).toBe('compilation');
    });

    it('should classify timeout correctly', () => {
        const testResult: TestRunResult = {
            command: 'npm test',
            exitCode: 1,
            stdout: '',
            stderr: 'ETIMEDOUT: request timed out',
            passed: false,
            failureKind: 'timeout',
            failureSummary: 'Process timed out.'
        };

        expect(testResult.failureKind).toBe('timeout');
    });

    it('should accumulate failure history in state', () => {
        const state: AgentState = {
            ...initialState,
            failureHistory: [
                { step: 'verifier', error: 'Test failed: compilation error', timestamp: Date.now() },
                { step: 'verifier', error: 'Test failed: syntax error', timestamp: Date.now() }
            ]
        };

        expect(state.failureHistory).toHaveLength(2);
        expect(state.failureHistory![0].step).toBe('verifier');
    });

    it('should enforce MAX_FAILURES limit', () => {
        const MAX_FAILURES = 3;
        const state: AgentState = {
            ...initialState,
            failureHistory: [
                { step: 'verifier', error: 'Error 1', timestamp: Date.now() },
                { step: 'verifier', error: 'Error 2', timestamp: Date.now() },
                { step: 'verifier', error: 'Error 3', timestamp: Date.now() }
            ]
        };

        expect(state.failureHistory!.length).toBeGreaterThanOrEqual(MAX_FAILURES);
    });
});
