import { describe, it, expect, vi } from 'vitest';
import { plannerNode } from '../../src/agent/nodes/planner.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';
import { ChatMessage } from '../../src/core/llm.js';

describe('Planner Loop Detection', () => {
    it('should detect useless loops (Planner->Verifier without file changes)', async () => {
        const config: KotefConfig = {
            rootDir: '/tmp/test',
            modelFast: 'gpt-4o-mini',
            modelStrong: 'gpt-4o',
            dryRun: true,
            offlineMode: false
        } as any;

        let capturedMessages: ChatMessage[] = [];

        const mockChatFn = vi.fn().mockImplementation(async (cfg: any, messages: ChatMessage[], options: any) => {
            capturedMessages = messages;
            return {
                messages: [
                    {
                        role: 'assistant',
                        content: JSON.stringify({
                            next: 'snitch',
                            reason: 'Loop detected',
                            solution_sketch: 'Stop looping'
                        })
                    }
                ]
            };
        });

        const state: AgentState = {
            messages: [],
            sdd: {
                project: 'Test Project',
                architect: 'Test Architect',
                bestPractices: 'Test Best Practices',
                goal: 'Fix bug',
                ticket: 'Ticket 1'
            },
            loopCounters: {
                planner_to_verifier: 2,
                lastFileChangeCount: 3,
                planner_to_researcher: 0,
                planner_to_coder: 0,
                lastResearchSignature: undefined,
                lastTestSignature: undefined
            },
            fileChanges: {
                'file1.ts': 'diff1',
                'file2.ts': 'diff2',
                'file3.ts': 'diff3'
            },
            plan: { next: 'planner', reason: 'init' } as any,
            totalSteps: 10,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        const node = plannerNode(config, mockChatFn as any);
        await node(state);

        // Check that the warning was injected
        const warningMsg = capturedMessages.find(m => m.role === 'system' && m.content.includes('CRITICAL WARNING'));
        expect(warningMsg).toBeDefined();
        expect(warningMsg?.content).toContain('STOP LOOPING');
    });

    it('should NOT warn if files have changed', async () => {
        const config: KotefConfig = {
            rootDir: '/tmp/test',
            modelFast: 'gpt-4o-mini',
            modelStrong: 'gpt-4o',
            dryRun: true,
            offlineMode: false
        } as any;

        let capturedMessages: ChatMessage[] = [];

        const mockChatFn = vi.fn().mockImplementation(async (cfg: any, messages: ChatMessage[], options: any) => {
            capturedMessages = messages;
            return {
                messages: [
                    {
                        role: 'assistant',
                        content: JSON.stringify({
                            next: 'verifier',
                            reason: 'Verifying new changes',
                            solution_sketch: 'Run tests'
                        })
                    }
                ]
            };
        });

        const state: AgentState = {
            messages: [],
            sdd: {
                project: 'Test Project',
                architect: 'Test Architect',
                bestPractices: 'Test Best Practices',
                goal: 'Fix bug',
                ticket: 'Ticket 1'
            },
            loopCounters: {
                planner_to_verifier: 2,
                lastFileChangeCount: 3,
                planner_to_researcher: 0,
                planner_to_coder: 0,
                lastResearchSignature: undefined,
                lastTestSignature: undefined
            },
            fileChanges: {
                'file1.ts': 'diff1',
                'file2.ts': 'diff2',
                'file3.ts': 'diff3',
                'file4.ts': 'diff4' // New file change
            },
            plan: { next: 'planner', reason: 'init' } as any,
            totalSteps: 10,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        const node = plannerNode(config, mockChatFn as any);
        await node(state);

        // Check that the warning was NOT injected
        const warningMsg = capturedMessages.find(m => m.role === 'system' && m.content.includes('CRITICAL WARNING'));
        expect(warningMsg).toBeUndefined();
    });
});
