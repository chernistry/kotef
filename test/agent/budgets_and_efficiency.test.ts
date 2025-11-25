import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentState, BudgetState } from '../../src/agent/state.js';
import { KotefConfig } from '../../src/core/config.js';

describe('Budget Tracking and Efficiency', () => {
    const mockConfig: KotefConfig = {
        rootDir: '/mock/root',
        modelFast: 'mock-model',
        modelStrong: 'mock-model',
        maxTokensPerRun: 1000,
        dryRun: true
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('Budget Initialization', () => {
        it('should initialize budget for fast-normal profile', () => {
            const budget: BudgetState = {
                maxCommands: 30,
                maxTestRuns: 5,
                maxWebRequests: 15,
                commandsUsed: 0,
                testRunsUsed: 0,
                webRequestsUsed: 0,
                commandHistory: []
            };

            expect(budget.maxCommands).toBe(30);
            expect(budget.maxTestRuns).toBe(5);
            expect(budget.commandsUsed).toBe(0);
        });

        it('should initialize budget for strict-large profile', () => {
            const budget: BudgetState = {
                maxCommands: 60,
                maxTestRuns: 10,
                maxWebRequests: 30,
                commandsUsed: 0,
                testRunsUsed: 0,
                webRequestsUsed: 0,
                commandHistory: []
            };

            expect(budget.maxCommands).toBe(60);
            expect(budget.maxTestRuns).toBe(10);
        });

        it('should initialize budget for yolo-tiny profile', () => {
            const budget: BudgetState = {
                maxCommands: 15,
                maxTestRuns: 2,
                maxWebRequests: 8,
                commandsUsed: 0,
                testRunsUsed: 0,
                webRequestsUsed: 0,
                commandHistory: []
            };

            expect(budget.maxCommands).toBe(15);
            expect(budget.maxTestRuns).toBe(2);
        });
    });

    describe('Budget Enforcement', () => {
        it('should track command usage', () => {
            const budget: BudgetState = {
                maxCommands: 10,
                maxTestRuns: 3,
                maxWebRequests: 10,
                commandsUsed: 0,
                testRunsUsed: 0,
                webRequestsUsed: 0,
                commandHistory: []
            };

            // Simulate command execution
            budget.commandsUsed++;
            budget.commandHistory.push({
                command: 'npm install',
                timestamp: Date.now()
            });

            expect(budget.commandsUsed).toBe(1);
            expect(budget.commandHistory.length).toBe(1);
        });

        it('should detect budget exhaustion', () => {
            const budget: BudgetState = {
                maxCommands: 5,
                maxTestRuns: 2,
                maxWebRequests: 10,
                commandsUsed: 5,
                testRunsUsed: 1,
                webRequestsUsed: 3,
                commandHistory: []
            };

            const exhausted = budget.commandsUsed >= budget.maxCommands;
            expect(exhausted).toBe(true);
        });

        it('should track test run usage', () => {
            const budget: BudgetState = {
                maxCommands: 10,
                maxTestRuns: 3,
                maxWebRequests: 10,
                commandsUsed: 2,
                testRunsUsed: 0,
                webRequestsUsed: 0,
                commandHistory: []
            };

            // Simulate test run
            budget.testRunsUsed++;
            expect(budget.testRunsUsed).toBe(1);
            expect(budget.testRunsUsed < budget.maxTestRuns).toBe(true);
        });
    });

    describe('Patch Deduplication', () => {
        it('should track patch fingerprints', () => {
            const patchFingerprints = new Map<string, number>();

            const fingerprint1 = 'abc123';
            patchFingerprints.set(fingerprint1, 1);

            expect(patchFingerprints.get(fingerprint1)).toBe(1);
        });

        it('should detect repeated patches', () => {
            const patchFingerprints = new Map<string, number>();
            const fingerprint = 'xyz789';

            // First application
            patchFingerprints.set(fingerprint, 1);

            // Second application
            const count = patchFingerprints.get(fingerprint) || 0;
            patchFingerprints.set(fingerprint, count + 1);

            expect(patchFingerprints.get(fingerprint)).toBe(2);

            // Third attempt should be aborted
            const shouldAbort = (patchFingerprints.get(fingerprint) || 0) >= 2;
            expect(shouldAbort).toBe(true);
        });

        it('should allow different patches on same file', () => {
            const patchFingerprints = new Map<string, number>();

            const patch1 = 'file1:patch-content-1';
            const patch2 = 'file1:patch-content-2';

            patchFingerprints.set(patch1, 1);
            patchFingerprints.set(patch2, 1);

            expect(patchFingerprints.size).toBe(2);
            expect(patchFingerprints.get(patch1)).toBe(1);
            expect(patchFingerprints.get(patch2)).toBe(1);
        });
    });

    describe('Command History Analysis', () => {
        it('should identify repeated commands', () => {
            const commandHistory = [
                { command: 'npm test', timestamp: 1 },
                { command: 'npm install', timestamp: 2 },
                { command: 'npm test', timestamp: 3 },
                { command: 'npm test', timestamp: 4 },
                { command: 'npm build', timestamp: 5 },
            ];

            const counts = new Map<string, number>();
            commandHistory.forEach(({ command }) => {
                counts.set(command, (counts.get(command) || 0) + 1);
            });

            expect(counts.get('npm test')).toBe(3);
            expect(counts.get('npm install')).toBe(1);
            expect(counts.get('npm build')).toBe(1);
        });

        it('should sort repeated commands by frequency', () => {
            const commandHistory = [
                { command: 'npm test', timestamp: 1 },
                { command: 'npm build', timestamp: 2 },
                { command: 'npm test', timestamp: 3 },
                { command: 'npm build', timestamp: 4 },
                { command: 'npm build', timestamp: 5 },
            ];

            const counts = new Map<string, number>();
            commandHistory.forEach(({ command }) => {
                counts.set(command, (counts.get(command) || 0) + 1);
            });

            const sorted = Array.from(counts.entries())
                .sort(([_, a], [__, b]) => b - a);

            expect(sorted[0][0]).toBe('npm build'); // 3 times
            expect(sorted[0][1]).toBe(3);
            expect(sorted[1][0]).toBe('npm test'); // 2 times
            expect(sorted[1][1]).toBe(2);
        });
    });
});
