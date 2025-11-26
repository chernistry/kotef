import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { deriveRiskEntries, appendRiskEntries, createTechDebtTicket } from '../../../src/agent/utils/risk.js';
import { AgentState } from '../../../src/agent/state.js';

describe('Risk Utilities', () => {
    const testRoot = path.resolve(process.cwd(), 'test-risk-workspace');
    const sddRoot = path.join(testRoot, '.sdd');

    beforeEach(async () => {
        await fs.mkdir(sddRoot, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testRoot, { recursive: true, force: true });
    });

    describe('deriveRiskEntries', () => {
        it('should detect stuck loop risk', () => {
            const state: AgentState = {
                messages: [],
                sdd: { goal: 'test', project: '', architect: '' },
                loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
                totalSteps: 10,
                consecutiveNoOps: 0,
                sameErrorCount: 3,
                lastError: 'Some repeated error'
            } as any;

            const risks = deriveRiskEntries(state);
            expect(risks).toHaveLength(1);
            expect(risks[0].type).toBe('reliability');
            expect(risks[0].severity).toBe('high');
            expect(risks[0].description).toContain('stuck in a loop');
        });

        it('should detect budget exhaustion risk', () => {
            const state: AgentState = {
                messages: [],
                sdd: { goal: 'test', project: '', architect: '' },
                loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
                totalSteps: 50,
                consecutiveNoOps: 0,
                sameErrorCount: 0,
                terminalStatus: 'aborted_constraint',
                budget: { commandsUsed: 100, maxCommands: 60 }
            } as any;

            const risks = deriveRiskEntries(state);
            expect(risks).toHaveLength(1);
            expect(risks[0].type).toBe('performance');
            expect(risks[0].severity).toBe('medium');
            expect(risks[0].description).toContain('exhausted its budget');
        });

        it('should detect recurring functional check failures', () => {
            const state: AgentState = {
                messages: [],
                sdd: { goal: 'test', project: '', architect: '' },
                loopCounters: { planner_to_researcher: 0, planner_to_verifier: 0, planner_to_coder: 0 },
                totalSteps: 10,
                consecutiveNoOps: 0,
                sameErrorCount: 0,
                functionalChecks: [
                    { command: 'npm test', exitCode: 1, timestamp: 1, node: 'verifier' },
                    { command: 'npm test', exitCode: 1, timestamp: 2, node: 'verifier' },
                    { command: 'ls', exitCode: 0, timestamp: 3, node: 'verifier' }
                ]
            } as any;

            const risks = deriveRiskEntries(state);
            expect(risks).toHaveLength(1);
            expect(risks[0].description).toContain("'npm test' failed repeatedly");
        });
    });

    describe('appendRiskEntries', () => {
        it('should create risk register and append entries', async () => {
            const risks = [
                {
                    id: 'R-001',
                    area: 'Test',
                    type: 'reliability' as const,
                    severity: 'high' as const,
                    status: 'open' as const,
                    description: 'Test risk',
                    evidence: 'Test evidence'
                }
            ];

            await appendRiskEntries(sddRoot, risks);

            const content = await fs.readFile(path.join(sddRoot, 'risk_register.md'), 'utf-8');
            expect(content).toContain('| R-001 | Test | reliability | high | open | Test risk | Test evidence |  |');
        });

        it('should increment IDs', async () => {
            const r1 = [{ id: 'R-001', area: 'A1', type: 'other' as const, severity: 'low' as const, status: 'open' as const, description: 'D1', evidence: 'E1' }];
            const r2 = [{ id: 'R-002', area: 'A2', type: 'other' as const, severity: 'low' as const, status: 'open' as const, description: 'D2', evidence: 'E2' }];

            await appendRiskEntries(sddRoot, r1);
            await appendRiskEntries(sddRoot, r2);

            const content = await fs.readFile(path.join(sddRoot, 'risk_register.md'), 'utf-8');
            expect(content).toContain('| R-001 |');
            expect(content).toContain('| R-002 |');
        });
    });

    describe('createTechDebtTicket', () => {
        it('should create ticket for high severity risk', async () => {
            const risk = {
                id: 'R-001',
                area: 'Core',
                type: 'reliability' as const,
                severity: 'high' as const,
                status: 'open' as const,
                description: 'Critical failure',
                evidence: 'Logs'
            };

            const ticketPath = await createTechDebtTicket(sddRoot, risk);
            expect(ticketPath).toBeTruthy();

            const content = await fs.readFile(ticketPath!, 'utf-8');
            expect(content).toContain('# Ticket: 1 Tech debt: Core - Critical failure');
            expect(content).toContain('**Risk Description**: Critical failure');
            expect(content).toContain('Risk: R-001');
        });

        it('should not create ticket for medium severity', async () => {
            const risk = {
                id: 'R-002',
                area: 'Core',
                type: 'reliability' as const,
                severity: 'medium' as const,
                status: 'open' as const,
                description: 'Minor failure',
                evidence: 'Logs'
            };

            const ticketPath = await createTechDebtTicket(sddRoot, risk);
            expect(ticketPath).toBeNull();
        });
    });
});
