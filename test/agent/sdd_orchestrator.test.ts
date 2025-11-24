import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runSddOrchestration } from '../../src/agent/graphs/sdd_orchestrator.js';
import { KotefConfig } from '../../src/core/config.js';

describe('SDD Orchestrator Graph', () => {
    let tempDir: string;

    afterEach(async () => {
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it('should run full SDD flow and create artifacts', async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kotef-sdd-test-'));

        const config: KotefConfig = {
            apiKey: 'dummy',
            mockMode: true,
            modelFast: 'gpt-4o-mini',
            modelStrong: 'gpt-4o',
            maxRunSeconds: 60,
            maxTokensPerRun: 1000,
            maxWebRequestsPerRun: 5
        };

        await runSddOrchestration(config, tempDir, 'Build a Todo App');

        // Verify .sdd/best_practices.md
        const bestPracticesPath = path.join(tempDir, '.sdd/best_practices.md');
        const bestPracticesExists = await fs.stat(bestPracticesPath).then(() => true).catch(() => false);
        assert.ok(bestPracticesExists, '.sdd/best_practices.md should exist');

        // Verify .sdd/architect.md
        const architectPath = path.join(tempDir, '.sdd/architect.md');
        const architectExists = await fs.stat(architectPath).then(() => true).catch(() => false);
        assert.ok(architectExists, '.sdd/architect.md should exist');

        // Verify tickets
        const ticketsDir = path.join(tempDir, '.sdd/backlog/tickets/open');
        const tickets = await fs.readdir(ticketsDir).catch(() => []);
        assert.ok(tickets.length > 0, 'Should have created at least one ticket');
        assert.ok(tickets.includes('01-mock-ticket.md'), 'Should have created mock ticket');
    });
});
