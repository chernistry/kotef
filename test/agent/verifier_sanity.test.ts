import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifierNode } from '../../src/agent/nodes/verifier.js';
import { detectCommands } from '../../src/agent/utils/verification.js';
import { runCommand } from '../../src/tools/test_runner.js';
import { AgentState } from '../../src/agent/state.js';

// Mock dependencies
vi.mock('../../src/agent/utils/verification.js');
vi.mock('../../src/tools/test_runner.js');
vi.mock('../../src/core/logger.js', () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));
vi.mock('../../src/core/llm.js', () => ({
    callChat: vi.fn().mockResolvedValue({ messages: [{ content: JSON.stringify({ next: 'planner', terminalStatus: 'ongoing' }) }] })
}));
vi.mock('../../src/core/prompts.js', () => ({
    loadRuntimePrompt: vi.fn().mockResolvedValue('mock prompt')
}));

describe('Verifier Integration - Syntax Sanity', () => {
    const mockConfig = { rootDir: '/test', modelFast: 'mock-model' } as any;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should run syntax check first when files changed (TS)', async () => {
        const state: Partial<AgentState> = {
            fileChanges: { 'src/index.ts': 1 },
            executionProfile: 'fast',
            sdd: {} as any,
            messages: []
        };

        vi.mocked(detectCommands).mockResolvedValue({
            stack: 'node',
            syntaxCheckCommand: 'npx tsc --noEmit',
            primaryTest: 'npm test'
        });

        vi.mocked(runCommand).mockResolvedValue({
            command: 'npx tsc --noEmit',
            exitCode: 1,
            stdout: '',
            stderr: 'SyntaxError: Unexpected token',
            passed: false
        });

        const node = verifierNode(mockConfig);
        const result = await node(state as AgentState);

        // Should have run syntax check
        expect(runCommand).toHaveBeenCalledWith(expect.anything(), 'npx tsc --noEmit');

        // Result should contain failure
        expect(result.testResults).toEqual(expect.arrayContaining([
            expect.objectContaining({
                command: 'npx tsc --noEmit',
                passed: false
            })
        ]));
    });

    it('should NOT run syntax check if no files changed', async () => {
        const state: Partial<AgentState> = {
            fileChanges: {}, // Empty
            executionProfile: 'fast',
            sdd: {} as any,
            messages: []
        };

        vi.mocked(detectCommands).mockResolvedValue({
            stack: 'node',
            syntaxCheckCommand: 'npx tsc --noEmit',
            primaryTest: 'npm test'
        });

        vi.mocked(runCommand).mockResolvedValue({
            command: 'npm test',
            exitCode: 0,
            stdout: 'OK',
            stderr: '',
            passed: true
        });

        const node = verifierNode(mockConfig);
        await node(state as AgentState);

        // Should NOT have run syntax check
        expect(runCommand).not.toHaveBeenCalledWith(expect.anything(), 'npx tsc --noEmit');
        // Should have run primary test
        expect(runCommand).toHaveBeenCalledWith(expect.anything(), 'npm test');
    });

    it('should run python syntax check when files changed', async () => {
        const state: Partial<AgentState> = {
            fileChanges: { 'main.py': 1 },
            executionProfile: 'fast',
            sdd: {} as any,
            messages: []
        };

        vi.mocked(detectCommands).mockResolvedValue({
            stack: 'python',
            syntaxCheckCommand: 'python3 -m compileall .',
            primaryTest: 'pytest'
        });

        vi.mocked(runCommand).mockResolvedValue({
            command: 'python3 -m compileall .',
            exitCode: 0,
            stdout: 'Compiling...',
            stderr: '',
            passed: true
        });

        const node = verifierNode(mockConfig);
        await node(state as AgentState);

        expect(runCommand).toHaveBeenCalledWith(expect.anything(), 'python3 -m compileall .');
    });
});
