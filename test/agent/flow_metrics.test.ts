
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeFlowMetrics, aggregateMetrics, saveAggregatedMetrics } from '../../src/agent/utils/flow_metrics.js';
import { AgentState } from '../../src/agent/state.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';

describe('Flow Metrics', () => {
    describe('computeFlowMetrics', () => {
        it('should compute metrics for a successful run', () => {
            const state: Partial<AgentState> = {
                fileChanges: { 'file1.ts': 'content', 'file2.ts': 'content' },
                budget: {
                    commandsUsed: 5,
                    testRunsUsed: 2,
                    webRequestsUsed: 1,
                    maxCommands: 10,
                    maxTestRuns: 5,
                    maxWebRequests: 5,
                    commandHistory: []
                },
                functionalChecks: [
                    { command: 'test', exitCode: 0, timestamp: 1000, node: 'verifier' },
                    { command: 'test', exitCode: 0, timestamp: 2000, node: 'verifier' }
                ],
                terminalStatus: 'done_success',
                diagnosticsLog: []
            };

            const metrics = computeFlowMetrics(state as AgentState, 0, 5000);

            expect(metrics.changeSize).toBe(2);
            expect(metrics.commandsUsed).toBe(5);
            expect(metrics.testRunsUsed).toBe(2);
            expect(metrics.webRequestsUsed).toBe(1);
            expect(metrics.verificationRuns).toBe(2);
            expect(metrics.diagnosticLatencySeconds).toBe(1); // 1000ms - 0ms
            expect(metrics.status).toBe('success');
            expect(metrics.failureMode).toBe('none');
            expect(metrics.durationSeconds).toBe(5);
        });

        it('should detect failure modes', () => {
            const state: Partial<AgentState> = {
                terminalStatus: 'aborted_stuck',
                diagnosticsLog: [
                    { source: 'test', message: 'fail', occurrenceCount: 1, firstSeenAt: 1000, lastSeenAt: 1000 }
                ]
            };

            const metrics = computeFlowMetrics(state as AgentState, 0, 1000);
            expect(metrics.status).toBe('failed');
            expect(metrics.failureMode).toBe('tests_failed'); // Diagnostics override generic stuck reason if present
        });

        it('should detect budget exhaustion', () => {
            const state: Partial<AgentState> = {
                terminalStatus: 'aborted_constraint',
                budget: {
                    commandsUsed: 10,
                    maxCommands: 10,
                    testRunsUsed: 0,
                    maxTestRuns: 5,
                    webRequestsUsed: 0,
                    maxWebRequests: 5,
                    commandHistory: []
                }
            };

            const metrics = computeFlowMetrics(state as AgentState, 0, 1000);
            expect(metrics.failureMode).toBe('budget_exhausted');
        });
    });

    describe('aggregateMetrics', () => {
        const testDir = path.join(process.cwd(), 'temp_test_metrics');

        beforeEach(async () => {
            await fs.mkdir(testDir, { recursive: true });
        });

        afterEach(async () => {
            await fs.rm(testDir, { recursive: true, force: true });
        });

        it('should aggregate metrics from run reports', async () => {
            // Create dummy reports
            const report1 = `
## Metrics
- **Tool Calls:** 10
- **LLM Calls:** 5
- **Total Tokens:** 1000

## Flow Metrics (DORA Proxies)
- **Change Size:** 2 files
- **Diagnostic Latency:** 1.5s
- **Verification Runs:** 3
- **Failure Mode:** none
- **Resource Usage:** 5 cmds, 2 tests, 1 web

**Status:** success
**Duration:** 10.0s
`;
            const report2 = `
## Metrics
...

## Flow Metrics (DORA Proxies)
- **Change Size:** 5 files
- **Diagnostic Latency:** 2.0s
- **Verification Runs:** 1
- **Failure Mode:** tests_failed
- **Resource Usage:** 8 cmds, 4 tests, 0 web

**Status:** failed
**Duration:** 20.0s
`;
            await fs.writeFile(path.join(testDir, 'run1.md'), report1);
            await fs.writeFile(path.join(testDir, 'run2.md'), report2);

            const aggregated = await aggregateMetrics(testDir);

            expect(aggregated.totalRuns).toBe(2);
            expect(aggregated.successRate).toBe(0.5);
            expect(aggregated.averageDurationSeconds).toBe(15);
            expect(aggregated.averageCommandsUsed).toBe(6.5); // (5+8)/2
            expect(aggregated.failureModes['tests_failed']).toBe(1);
        });
    });
});
