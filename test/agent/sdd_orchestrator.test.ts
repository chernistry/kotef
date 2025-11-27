import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSddOrchestration } from '../../src/agent/graphs/sdd_orchestrator.js';
import { KotefConfig } from '../../src/core/config.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// Mock dependencies
vi.mock('node:fs/promises', () => ({
    default: {
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('Mock file content'),
        mkdir: vi.fn().mockResolvedValue(undefined)
    },
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('Mock file content'),
    mkdir: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('node:fs', async () => {
    return {
        promises: {
            writeFile: vi.fn(),
            readFile: vi.fn(),
            mkdir: vi.fn()
        }
    };
});

vi.mock('../../src/core/llm.js', () => ({
    callChat: vi.fn()
}));

vi.mock('../../src/sdd/template_driver.js', () => ({
    renderBrainTemplate: vi.fn().mockReturnValue('Mock template'),
    loadBrainTemplate: vi.fn().mockReturnValue('Mock ticket template')
}));

vi.mock('../../src/tools/deep_research.js', () => ({
    deepResearch: vi.fn().mockResolvedValue({ findings: [] })
}));

vi.mock('../../src/core/prompts.js', () => ({
    loadRuntimePrompt: vi.fn().mockResolvedValue('Mock prompt {{MODE}}'),
    loadPrompt: vi.fn().mockResolvedValue('Mock prompt')
}));

vi.mock('../../src/agent/utils/sdd_validation.js', () => ({
    validateBestPracticesDoc: vi.fn().mockReturnValue({ ok: true }),
    validateArchitectDoc: vi.fn().mockReturnValue({ ok: true })
}));

import { callChat } from '../../src/core/llm.js';

describe('SDD Orchestrator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should use two-phase generation for tickets', async () => {
        const config = { rootDir: '/tmp/test', modelFast: 'test-model' } as KotefConfig;
        const mockCallChat = vi.mocked(callChat);

        // Mock responses for the sequence:
        // 1. Research (best_practices.md)
        // 2. Architect (architect.md)
        // 3. Tickets Phase 1 (Plan)
        // 4. Tickets Phase 2 (Ticket 1)
        // 5. Tickets Phase 2 (Ticket 2)

        mockCallChat
            // Research
            .mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: 'Best practices content' }]
            })
            // Architect
            .mockResolvedValueOnce({
                messages: [{ role: 'assistant', content: 'Architect content' }]
            })
            // Tickets Phase 1 (Plan)
            .mockResolvedValueOnce({
                messages: [{
                    role: 'assistant',
                    content: JSON.stringify({
                        tickets: [
                            { filename: '01-t1.md', title: 'T1', summary: 'S1' },
                            { filename: '02-t2.md', title: 'T2', summary: 'S2' }
                        ]
                    })
                }]
            })
            // Tickets Phase 2 (Ticket 1)
            .mockResolvedValueOnce({
                messages: [{
                    role: 'assistant',
                    content: JSON.stringify({ content: '# Ticket 1 Content' })
                }]
            })
            // Tickets Phase 2 (Ticket 2)
            .mockResolvedValueOnce({
                messages: [{
                    role: 'assistant',
                    content: JSON.stringify({ content: '# Ticket 2 Content' })
                }]
            });

        await runSddOrchestration(config, '/tmp/test', 'Test Goal');

        // Verify Phase 1 call
        const planCall = mockCallChat.mock.calls.find(call =>
            call[1][1].content.includes('PLAN_ONLY')
        );
        expect(planCall).toBeDefined();

        // Verify Phase 2 calls
        const genCalls = mockCallChat.mock.calls.filter(call =>
            call[1][1].content.includes('GENERATE_SINGLE')
        );
        expect(genCalls).toHaveLength(2);

        // Verify file writes
        expect(fs.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('01-t1.md'),
            '# Ticket 1 Content'
        );
        expect(fs.writeFile).toHaveBeenCalledWith(
            expect.stringContaining('02-t2.md'),
            '# Ticket 2 Content'
        );
    });
});
