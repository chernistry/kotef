
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { plannerNode } from '../../src/agent/nodes/planner.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';
import * as llmModule from '../../src/core/llm.js';
import * as promptsModule from '../../src/core/prompts.js';
import * as fs from 'node:fs/promises';

// Mock dependencies
const mockConfig: KotefConfig = {
    rootDir: '/tmp/test',
    modelFast: 'mock-fast',
    modelStrong: 'mock-strong',
    maxRunSeconds: 60,
    maxTokensPerRun: 1000,
    dryRun: true
};

vi.mock('../../src/core/llm.js');
vi.mock('../../src/core/prompts.js');
vi.mock('node:fs/promises');

describe('Planner Research Gating', () => {
    let mockState: AgentState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            messages: [],
            sdd: { project: 'Project', architect: 'Architect' },
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
            totalSteps: 0,
            runProfile: 'strict', // Default to strict for these tests
            researchQuality: {
                lastQuery: 'q',
                relevance: 0.9,
                confidence: 0.9,
                coverage: 0.9,
                support: 0.9,
                recency: 0.9,
                diversity: 0.9,
                hasConflicts: false,
                shouldRetry: false,
                reasons: 'Good',
                attemptCount: 1
            }
        } as any;

        vi.spyOn(promptsModule, 'loadRuntimePrompt').mockResolvedValue('PLANNER PROMPT');
        vi.spyOn(fs, 'readFile').mockResolvedValue(''); // Mock risk register read
    });

    it('should allow high quality research in strict mode', async () => {
        // Planner decides to code
        vi.spyOn(llmModule, 'callChat').mockResolvedValue({
            messages: [{ role: 'assistant', content: JSON.stringify({ next: 'coder', reason: 'Ready' }) }]
        } as any);

        const node = plannerNode(mockConfig);
        const result = await node(mockState);

        expect(result.plan?.next).toBe('coder');
    });

    it('should block low support in strict mode', async () => {
        mockState.researchQuality!.support = 0.2; // Low support

        // Planner wants to research more (or code, doesn't matter, logic checks state before calling LLM if next was researcher? No, logic is AFTER LLM decision)
        // Wait, the logic is: "if nextNode === 'researcher' && state.researchQuality".
        // This means if the planner decides to loop back to researcher, we check if we should abort.
        // BUT, the ticket says: "block strict profile implementation when overall_support is low".
        // This implies if the planner tries to go to CODER, we should block?
        // Or if the planner tries to go to RESEARCHER again after failing?
        // Let's re-read the code I wrote.

        /*
        if (nextNode === 'researcher' && state.researchQuality) {
            // ... checks ...
             if (lowSupport || lowRecency || hasConflicts) {
                   decision.next = 'snitch';
                   // ...
             }
        }
        */

        // My implementation only gates looping back to RESEARCHER.
        // If the planner decides "I have enough info, let's CODE", my current logic DOES NOT block it.
        // The ticket says: "Planner uses enhanced researchQuality to block strict profile implementation".
        // This implies I should block transition to CODER if quality is low?
        // "block strict profile implementation" -> prevent coding.
        // So if nextNode === 'coder', I should check quality?
        // Re-reading ticket: "block strict profile implementation when ...".
        // Yes, I should probably block 'coder' transition too, or at least warn.
        // But the code I wrote is inside `if (nextNode === 'researcher' ...`.
        // This seems to be "Abort if we are STUCK in research loop with low quality".
        // But if the planner says "Screw it, let's code", I should probably also block it in strict mode?
        // Let's assume for now I only implemented the "stuck in research" check.
        // Wait, if I want to block implementation, I should check `nextNode === 'coder'`.
        // Let's check the code I wrote again.

        // In planner.ts:
        // if (nextNode === 'researcher' && state.researchQuality) { ... }

        // This only catches cases where planner wants to research MORE.
        // If planner wants to CODE, it goes through.
        // This might be a gap. The ticket says "block strict profile implementation".
        // If the LLM thinks it's ready but the scores are low, we should probably stop it.
        // Planner decides to code despite low quality
        vi.spyOn(llmModule, 'callChat').mockResolvedValue({
            messages: [{ role: 'assistant', content: JSON.stringify({ next: 'coder', reason: 'Let us code' }) }]
        } as any);

        const node = plannerNode(mockConfig);
        const result = await node(mockState);

        expect(result.plan?.next).toBe('snitch');
        expect(result.terminalStatus).toBe('aborted_constraint');
        expect(result.plan?.reason).toContain('Strict Mode');
        expect(result.plan?.reason).toContain('coder');
    });

    it('should block conflicts in strict mode', async () => {
        mockState.researchQuality!.hasConflicts = true;

        // Planner decides to research again
        vi.spyOn(llmModule, 'callChat').mockResolvedValue({
            messages: [{ role: 'assistant', content: JSON.stringify({ next: 'researcher', reason: 'Resolve conflicts' }) }]
        } as any);

        const node = plannerNode(mockConfig);
        const result = await node(mockState);

        expect(result.plan?.next).toBe('snitch');
        expect(result.terminalStatus).toBe('aborted_constraint');
    });

    it('should allow low quality in fast mode', async () => {
        mockState.runProfile = 'fast';
        mockState.researchQuality!.support = 0.2;

        // Planner decides to research again
        vi.spyOn(llmModule, 'callChat').mockResolvedValue({
            messages: [{ role: 'assistant', content: JSON.stringify({ next: 'researcher', reason: 'More info' }) }]
        } as any);

        const node = plannerNode(mockConfig);
        const result = await node(mockState);

        expect(result.plan?.next).toBe('researcher'); // Should NOT be snitch
    });
});
