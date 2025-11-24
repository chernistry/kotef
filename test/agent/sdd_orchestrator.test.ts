import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, it, afterEach, expect, vi } from 'vitest';
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

        await runSddOrchestration(config, tempDir, 'Build a CLI tool');
        // Verify tickets
        const ticketsDir = path.join(tempDir, '.sdd/backlog/tickets/open');
        const tickets = await fs.readdir(ticketsDir).catch(() => []);
        expect(tickets.length).toBeGreaterThan(0);
        expect(tickets).toContain('01-mock-ticket.md');
    });
});
