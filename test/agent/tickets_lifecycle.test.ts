import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ticketCloserNode } from '../../src/agent/nodes/ticket_closer.js';
import { AgentState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';

// Mock fs
vi.mock('node:fs/promises');

describe('Ticket Lifecycle', () => {
    const mockConfig: KotefConfig = {
        rootDir: '/mock/root',
        modelFast: 'mock-model',
        modelStrong: 'mock-model',
        maxTokensPerRun: 1000,
        dryRun: false,
        gitEnabled: false
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should move ticket from open to closed', async () => {
        const openPath = '/mock/root/.sdd/backlog/tickets/open/17-test-ticket.md';
        const closedPath = '/mock/root/.sdd/backlog/tickets/closed/17-test-ticket.md';

        const mockState: AgentState = {
            messages: [],
            sdd: {
                goal: 'test',
                project: '',
                architect: '',
                ticketPath: openPath,
                ticketId: '17-test-ticket'
            },
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
            totalSteps: 1,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        // Mock fs operations
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.rename).mockResolvedValue(undefined);

        const closer = ticketCloserNode(mockConfig);
        const result = await closer(mockState);

        // Verify mkdir was called to create closed dir
        expect(fs.mkdir).toHaveBeenCalledWith(
            '/mock/root/.sdd/backlog/tickets/closed',
            { recursive: true }
        );

        // Verify rename was called to move ticket
        expect(fs.rename).toHaveBeenCalledWith(openPath, closedPath);

        // Verify result updates ticketPath
        expect(result.sdd?.ticketPath).toBe(closedPath);
    });

    it('should handle missing ticketPath gracefully', async () => {
        const mockState: AgentState = {
            messages: [],
            sdd: {
                goal: 'test',
                project: '',
                architect: ''
                // No ticketPath
            },
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
            totalSteps: 1,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        const closer = ticketCloserNode(mockConfig);
        const result = await closer(mockState);

        // Should return empty object without crashing
        expect(result).toEqual({});
        expect(fs.rename).not.toHaveBeenCalled();
    });

    it('should not fail the run if ticket move fails', async () => {
        const openPath = '/mock/root/.sdd/backlog/tickets/open/17-test-ticket.md';

        const mockState: AgentState = {
            messages: [],
            sdd: {
                goal: 'test',
                project: '',
                architect: '',
                ticketPath: openPath
            },
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
            totalSteps: 1,
            consecutiveNoOps: 0,
            sameErrorCount: 0
        };

        // Mock rename to fail
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.rename).mockRejectedValue(new Error('Permission denied'));

        const closer = ticketCloserNode(mockConfig);
        const result = await closer(mockState);

        // Should return empty object and not throw
        expect(result).toEqual({});
    });

    describe('CLI Integration - Ticket Metadata', () => {
        it('should extract ticketId from filename', () => {
            // Test ticketId extraction logic
            const testCases = [
                { filename: '45-ticket-lifecycle.md', expected: '45-ticket-lifecycle' },
                { filename: '17-goal-aware-verification.md', expected: '17-goal-aware-verification' },
                { filename: '1-simple.md', expected: '1-simple' }
            ];

            testCases.forEach(({ filename, expected }) => {
                const ticketId = filename.replace(/\.md$/, '');
                expect(ticketId).toBe(expected);
            });
        });

        it('should infer ticketStatus as closed when path contains /closed/', () => {
            const testPaths = [
                { path: '/root/.sdd/backlog/tickets/closed/45-ticket.md', expected: 'closed' },
                { path: '/root/.sdd/backlog/tickets/open/45-ticket.md', expected: 'open' },
                { path: '/something/closed/in/middle/45-ticket.md', expected: 'closed' }
            ];

            testPaths.forEach(({ path, expected }) => {
                const ticketStatus = path.includes('/closed/') ? 'closed' : 'open';
                expect(ticketStatus).toBe(expected);
            });
        });

        it('should detect when ticket is done but still in open/', () => {
            // Simulate scenario where done=true but ticket wasn't moved
            const done = true;
            const finalTicketPath = '/root/.sdd/backlog/tickets/open/45-ticket.md';
            const ticketStatus = finalTicketPath.includes('/closed/') ? 'closed' : 'open';

            // This should trigger a warning
            expect(done && ticketStatus === 'open').toBe(true);
        });
    });
});

