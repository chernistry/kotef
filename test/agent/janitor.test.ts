import { describe, it, expect, vi, beforeEach } from 'vitest';
import { janitorNode } from '../../src/agent/nodes/janitor.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Mock dependencies
vi.mock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    return {
        ...actual,
        promises: {
            ...actual.promises,
            writeFile: vi.fn().mockResolvedValue(undefined)
        }
    };
});

describe('Janitor Node', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create a tech debt ticket when instructed', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'ticket_closer',
                    actions: [{
                        type: 'create_ticket',
                        title: 'Fix lint errors',
                        description: 'There are unused variables in src/utils.ts',
                        steps: '1. Remove unused variables',
                        affected_files: 'src/utils.ts'
                    }]
                })
            }]
        });

        const config = { rootDir: '/tmp' } as KotefConfig;
        const janitor = janitorNode(config, mockChat);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'fix build',
                project: 'Test Project',
                architect: 'Test Architect',
                issues: 'Lint errors found'
            },
            loopCounters: {
                planner_to_researcher: 0,
                planner_to_verifier: 0,
                planner_to_coder: 0
            },
            totalSteps: 0,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        const result = await janitor(initialState);

        expect(fs.writeFile).toHaveBeenCalled();
        const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
        expect(writeCall[0]).toContain('.sdd/backlog/tickets/open/');
        expect(writeCall[1]).toContain('# Ticket: Fix lint errors');

        expect(result.plan?.next).toBe('ticket_closer');
    });

    it('should proceed to done if no actions needed', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            messages: [{
                role: 'assistant',
                content: JSON.stringify({
                    next: 'done',
                    actions: []
                })
            }]
        });

        const config = { rootDir: '/tmp' } as KotefConfig;
        const janitor = janitorNode(config, mockChat);

        const initialState: AgentState = {
            messages: [],
            sdd: {
                goal: 'clean run',
                project: 'Test Project',
                architect: 'Test Architect'
            },
            loopCounters: {
                planner_to_researcher: 0,
                planner_to_verifier: 0,
                planner_to_coder: 0
            },
            totalSteps: 0,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        const result = await janitor(initialState);

        expect(fs.writeFile).not.toHaveBeenCalled();
        expect(result.plan?.next).toBe('done');
    });
});
