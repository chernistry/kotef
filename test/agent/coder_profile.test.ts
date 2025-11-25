import { describe, it, expect, vi, beforeEach } from 'vitest';
import { coderNode } from '../../src/agent/nodes/coder.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';
import { PROFILE_POLICIES } from '../../src/agent/profiles.js';

// Mock dependencies
const mockCallChat = vi.fn();
const mockRunCommand = vi.fn();

vi.mock('../../src/core/llm.js', () => ({
    callChat: (...args: any[]) => mockCallChat(...args)
}));

vi.mock('../../src/tools/test_runner.js', () => ({
    runCommand: (...args: any[]) => mockRunCommand(...args)
}));

vi.mock('../../src/tools/fs.js', () => ({
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    writePatch: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([])
}));

describe('Coder Node - Execution Profiles', () => {
    let config: KotefConfig;
    let state: AgentState;

    beforeEach(() => {
        vi.clearAllMocks();
        config = {
            rootDir: '/tmp/test',
            modelStrong: 'mock-model',
            modelWeak: 'mock-model',
            mockMode: true
        } as any;
        state = {
            messages: [],
            sdd: {
                ticket: 'Implement feature X',
                goal: 'Feature X works',
                project: 'Test Project',
                architect: 'Architecture',
                bestPractices: 'Best Practices'
            },
            runProfile: 'fast',
            plan: 'Step 1: Do it',
            fileChanges: {},
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
            totalSteps: 0,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };
    });

    it('should respect maxCommands limit for fast profile', async () => {
        state.runProfile = 'fast';
        const policy = PROFILE_POLICIES.fast;

        // Mock LLM to return tool calls for running commands
        // We want to exceed the limit (8 for fast)
        const toolCalls = [];
        for (let i = 0; i < policy.maxCommands + 2; i++) {
            toolCalls.push({
                function: {
                    name: 'run_command',
                    arguments: JSON.stringify({ command: `echo ${i}` })
                }
            });
        }

        mockCallChat.mockResolvedValue({
            messages: [{
                role: 'assistant',
                tool_calls: toolCalls
            }]
        });

        mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: 'ok', passed: true });

        const node = coderNode(config, mockCallChat);
        try {
            await node(state);
        } catch (e) {
            console.error('Coder node error:', e);
            throw e;
        }

        // We expect runCommand to be called exactly maxCommands times
        expect(mockRunCommand).toHaveBeenCalledTimes(policy.maxCommands);
    });

    it('should block package installs in smoke profile', async () => {
        state.runProfile = 'smoke';

        mockCallChat.mockResolvedValue({
            messages: [{
                role: 'assistant',
                tool_calls: [{
                    function: {
                        name: 'run_command',
                        arguments: JSON.stringify({ command: 'npm install lodash' })
                    }
                }]
            }]
        });

        const node = coderNode(config, mockCallChat);
        await node(state);

        // Should not run the command
        expect(mockRunCommand).not.toHaveBeenCalled();
    });

    it('should allow package installs in strict profile', async () => {
        state.runProfile = 'strict';

        mockCallChat.mockResolvedValue({
            messages: [{
                role: 'assistant',
                tool_calls: [{
                    function: {
                        name: 'run_command',
                        arguments: JSON.stringify({ command: 'npm install lodash' })
                    }
                }]
            }]
        });

        mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: 'ok', passed: true });

        const node = coderNode(config, mockCallChat);
        await node(state);

        // Should run the command
        expect(mockRunCommand).toHaveBeenCalledWith(config, 'npm install lodash');
    });
});
