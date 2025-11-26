import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { writeRunReport, RunSummary } from '../../src/agent/run_report.js';
import { AgentState } from '../../src/agent/state.js';

describe('Run Report Integration', () => {
    const testRoot = path.resolve(process.cwd(), 'test-run-report-workspace');
    const sddRoot = path.join(testRoot, '.sdd');

    beforeEach(async () => {
        await fs.mkdir(sddRoot, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testRoot, { recursive: true, force: true });
    });

    it('should include ticket metadata in run report', async () => {
        const summary: RunSummary = {
            plan: 'Test plan',
            filesChanged: ['test.ts'],
            tests: 'All passed',
            status: 'success',
            ticketId: '47-test-ticket',
            ticketPath: '/path/to/tickets/open/47-test-ticket.md',
            ticketStatus: 'open',
            durationSeconds: 10
        };

        await writeRunReport(sddRoot, 'test-run-001', summary);

        const runsDir = path.join(sddRoot, 'runs');
        const files = await fs.readdir(runsDir);
        expect(files.length).toBe(1);

        const reportContent = await fs.readFile(path.join(runsDir, files[0]), 'utf-8');

        expect(reportContent).toContain('## Ticket');
        expect(reportContent).toContain('**Ticket ID:** 47-test-ticket');
        expect(reportContent).toContain('**Ticket Path:** /path/to/tickets/open/47-test-ticket.md');
        expect(reportContent).toContain('**Ticket Status:** open');
    });

    it('should include commit hash when present', async () => {
        const summary: RunSummary = {
            plan: 'Test plan',
            filesChanged: ['test.ts'],
            tests: 'All passed',
            status: 'success',
            ticketId: '47-test-ticket',
            ticketPath: '/path/to/tickets/closed/47-test-ticket.md',
            ticketStatus: 'closed',
            commitHash: 'abc123def456'
        };

        await writeRunReport(sddRoot, 'test-run-002', summary);

        const runsDir = path.join(sddRoot, 'runs');
        const files = await fs.readdir(runsDir);
        const reportContent = await fs.readFile(path.join(runsDir, files[0]), 'utf-8');

        expect(reportContent).toContain('**Commit Hash:** `abc123def456`');
    });

    it('should include ADRs and Assumptions when state provided', async () => {
        const summary: RunSummary = {
            plan: 'Test plan',
            filesChanged: [],
            tests: 'N/A',
            status: 'success'
        };

        const state: AgentState = {
            messages: [],
            sdd: { goal: 'test', project: '', architect: '' },
            loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
            totalSteps: 1,
            consecutiveNoOps: 0,
            sameErrorCount: 0,
            designDecisions: [
                {
                    id: 'ADR-001',
                    title: 'Use PostgreSQL',
                    context: 'Need database',
                    decision: 'Chose PostgreSQL'
                }
            ],
            assumptions: [
                {
                    id: 'A-001',
                    statement: 'API is stable',
                    status: 'tentative',
                    source: 'guess'
                }
            ]
        };

        await writeRunReport(sddRoot, 'test-run-003', summary, state);

        const runsDir = path.join(sddRoot, 'runs');
        const files = await fs.readdir(runsDir);
        const reportContent = await fs.readFile(path.join(runsDir, files[0]), 'utf-8');

        expect(reportContent).toContain('## Architectural Decisions (ADRs)');
        expect(reportContent).toContain('**Use PostgreSQL** (ID: ADR-001)');
        expect(reportContent).toContain('## Assumptions Log');
        expect(reportContent).toContain('API is stable');
    });

    it('should not include ticket section when no ticket info', async () => {
        const summary: RunSummary = {
            plan: 'Test plan',
            filesChanged: [],
            tests: 'N/A',
            status: 'success'
        };

        await writeRunReport(sddRoot, 'test-run-004', summary);

        const runsDir = path.join(sddRoot, 'runs');
        const files = await fs.readdir(runsDir);
        const reportContent = await fs.readFile(path.join(runsDir, files[0]), 'utf-8');

        expect(reportContent).not.toContain('## Ticket');
    });
});
