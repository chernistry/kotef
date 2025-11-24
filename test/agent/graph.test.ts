import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { buildKotefGraph } from '../../src/agent/graph.js';
import { loadConfig } from '../../src/core/config.js';
import { AgentState } from '../../src/agent/state.js';

describe('Agent Graph', () => {
    // Mock env vars BEFORE loading config
    const originalEnv = process.env;
    process.env = { ...originalEnv, KOTEF_API_KEY: 'dummy-key', SEARCH_API_KEY: 'dummy-key' };

    const cfg = loadConfig();

    afterEach(() => {
        // Restore env if needed, though cfg is already loaded
        // process.env = originalEnv;
    });

    it('should compile and run a simple flow', async () => {
        // Mock chatFn
        const mockChatFn = async () => {
            return {
                messages: [{
                    role: 'assistant',
                    content: JSON.stringify({ next: 'done' })
                }]
            };
        };

        const graph = buildKotefGraph(cfg, { chatFn: mockChatFn as any });

        const result = await graph.invoke({
            messages: [{ role: 'user', content: 'Do something' }],
            sdd: {
                project: '# Project',
                architect: '# Architect',
                bestPractices: '# Best Practices',
                ticket: '# Ticket'
            }
        });

        assert.ok(result);
    });

});
