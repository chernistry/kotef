import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retrospectiveNode } from '../../src/agent/nodes/retrospective.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';
import { promises as fs } from 'node:fs';

// Mock dependencies
vi.mock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    return {
        ...actual,
        promises: {
            ...actual.promises,
            writeFile: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
            mkdir: vi.fn().mockResolvedValue(undefined)
        }
    };
});

vi.mock('../../src/core/prompts.js', () => ({
    loadPrompt: vi.fn().mockResolvedValue('Mock prompt: {{TERMINAL_STATUS}} {{PROGRESS_HISTORY}} {{LOOP_COUNTERS}} {{GOAL}} {{TEST_RESULTS}} {{DIAGNOSTICS}} {{FILE_CHANGES}}')
}));

describe('Retrospective Node', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should log metrics even without progress history', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({ learnings: [] })
            }]
        });

        const config = { rootDir: '/tmp', modelFast: 'test-model' } as KotefConfig;
        const retrospective = retrospectiveNode(config, mockChat);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'test goal',
                project: 'Test Project',
                architect: 'Test Architect'
            },
            loopCounters: {
                planner_to_researcher: 2,
                planner_to_verifier: 1,
                planner_to_coder: 3
            },
            totalSteps: 10,
            terminalStatus: 'done_success',
            failureHistory: [
                { step: 'test', error: 'error1', timestamp: 123 }
            ],
            fileChanges: { 'file1.ts': 10, 'file2.ts': 20 },
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        await retrospective(initialState);

        // Verify metrics were logged
        expect(fs.writeFile).toHaveBeenCalled();
        const metricsCall = vi.mocked(fs.writeFile).mock.calls.find(call =>
            call[0].toString().includes('.sdd/metrics/')
        );
        expect(metricsCall).toBeDefined();

        if (metricsCall) {
            const metricsContent = JSON.parse(metricsCall[1] as string);
            expect(metricsContent.terminalStatus).toBe('done_success');
            expect(metricsContent.totalSteps).toBe(10);
            expect(metricsContent.errorCount).toBe(1);
            expect(metricsContent.fileChanges).toBe(2);
        }
    });

    it('should append learnings to learning_log.md', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    learnings: [{
                        category: 'success',
                        insight: 'Tests passed quickly',
                        confidence: 'high'
                    }]
                })
            }]
        });

        const config = { rootDir: '/tmp', modelFast: 'test-model' } as KotefConfig;
        const retrospective = retrospectiveNode(config, mockChat);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'test goal',
                project: 'Test Project',
                architect: 'Test Architect'
            },
            loopCounters: {
                planner_to_researcher: 0,
                planner_to_verifier: 0,
                planner_to_coder: 0
            },
            totalSteps: 5,
            progressHistory: [
                { node: 'coder', fileChangeCount: 2, timestamp: 123, sameErrorCount: 0, functionalChecksCount: 0 }
            ],
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        await retrospective(initialState);

        // Verify learning_log.md was written
        const learningCall = vi.mocked(fs.writeFile).mock.calls.find(call =>
            call[0].toString().includes('learning_log.md')
        );
        expect(learningCall).toBeDefined();

        if (learningCall) {
            const content = learningCall[1] as string;
            expect(content).toContain('# Learning Log');
            expect(content).toContain('Tests passed quickly');
            expect(content).toContain('(success)');
        }
    });

    it('should skip learnings with low confidence', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    learnings: [{
                        category: 'improvement',
                        insight: 'Maybe use better naming',
                        confidence: 'low'
                    }]
                })
            }]
        });

        const config = { rootDir: '/tmp', modelFast: 'test-model' } as KotefConfig;
        const retrospective = retrospectiveNode(config, mockChat);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'test goal',
                project: 'Test Project',
                architect: 'Test Architect'
            },
            loopCounters: {
                planner_to_researcher: 0,
                planner_to_verifier: 0,
                planner_to_coder: 0
            },
            totalSteps: 5,
            progressHistory: [
                { node: 'coder', fileChangeCount: 2, timestamp: 123, sameErrorCount: 0, functionalChecksCount: 0 }
            ],
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        await retrospective(initialState);

        // Verify learning_log.md was NOT written (only metrics)
        const learningCall = vi.mocked(fs.writeFile).mock.calls.find(call =>
            call[0].toString().includes('learning_log.md')
        );
        expect(learningCall).toBeUndefined();
    });
});
