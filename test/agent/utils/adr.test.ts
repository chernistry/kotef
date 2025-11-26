import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { appendAdr, syncAssumptions } from '../../../src/agent/utils/adr.js';
import { DesignDecision, Assumption } from '../../../src/agent/state.js';
import { createLogger } from '../../../src/core/logger.js';

describe('ADR Utilities', () => {
    const testRoot = path.resolve(process.cwd(), 'test-adr-workspace');
    const logger = createLogger('adr-test');

    beforeEach(async () => {
        await fs.mkdir(testRoot, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testRoot, { recursive: true, force: true });
    });

    describe('appendAdr', () => {
        it('should create a new ADR file with auto-generated ID', async () => {
            const decision: DesignDecision = {
                title: 'Use PostgreSQL',
                context: 'We need a database.',
                decision: 'We will use PostgreSQL.',
                alternatives: ['MySQL', 'SQLite'],
                consequences: ['Good performance', 'Complex setup']
            };

            const filepath = await appendAdr(testRoot, decision, logger);

            expect(filepath).toContain('ADR-001-use-postgresql.md');
            const content = await fs.readFile(filepath, 'utf-8');
            expect(content).toContain('# ADR-001: Use PostgreSQL');
            expect(content).toContain('**Status:** Accepted');
            expect(content).toContain('## Context\nWe need a database.');
            expect(content).toContain('## Decision\nWe will use PostgreSQL.');
            expect(content).toContain('- MySQL');
            expect(content).toContain('- Good performance');
        });

        it('should increment ID for subsequent ADRs', async () => {
            const d1: DesignDecision = { title: 'First', context: 'c', decision: 'd' };
            const d2: DesignDecision = { title: 'Second', context: 'c', decision: 'd' };

            await appendAdr(testRoot, d1, logger);
            const filepath = await appendAdr(testRoot, d2, logger);

            expect(filepath).toContain('ADR-002-second.md');
        });

        it('should use provided ID if present', async () => {
            const decision: DesignDecision = {
                id: 'ADR-042',
                title: 'Custom ID',
                context: 'c',
                decision: 'd'
            };

            const filepath = await appendAdr(testRoot, decision, logger);
            expect(filepath).toContain('ADR-042-custom-id.md');
            const content = await fs.readFile(filepath, 'utf-8');
            expect(content).toContain('# ADR-042: Custom ID');
        });
    });

    describe('syncAssumptions', () => {
        it('should create assumptions file if missing', async () => {
            const assumptions: Assumption[] = [
                {
                    statement: 'API is stable',
                    status: 'tentative',
                    source: 'guess',
                    area: 'Backend'
                }
            ];

            await syncAssumptions(testRoot, assumptions, logger);

            const filepath = path.join(testRoot, 'assumptions.md');
            const content = await fs.readFile(filepath, 'utf-8');

            expect(content).toContain('# Assumptions Log');
            expect(content).toContain('| A-001 | Backend | API is stable | tentative | guess |  |');
        });

        it('should append new assumptions with incremented IDs', async () => {
            const a1: Assumption[] = [{ statement: 'First', status: 'tentative', source: 'guess' }];
            await syncAssumptions(testRoot, a1, logger);

            const a2: Assumption[] = [{ statement: 'Second', status: 'confirmed', source: 'research' }];
            await syncAssumptions(testRoot, a2, logger);

            const filepath = path.join(testRoot, 'assumptions.md');
            const content = await fs.readFile(filepath, 'utf-8');

            expect(content).toContain('| A-001 | General | First | tentative | guess |  |');
            expect(content).toContain('| A-002 | General | Second | confirmed | research |  |');
        });

        it('should not duplicate assumptions with same ID', async () => {
            const a1: Assumption[] = [{ id: 'A-001', statement: 'First', status: 'tentative', source: 'guess' }];
            await syncAssumptions(testRoot, a1, logger);

            // Try to add same ID again
            await syncAssumptions(testRoot, a1, logger);

            const filepath = path.join(testRoot, 'assumptions.md');
            const content = await fs.readFile(filepath, 'utf-8');

            // Should only appear once (naive check by counting occurrences of ID string)
            const matches = content.match(/\| A-001 \|/g);
            expect(matches).toHaveLength(1);
        });
    });
});
