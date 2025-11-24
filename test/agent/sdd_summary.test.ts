import { describe, it, expect } from 'vitest';
import { buildSddSummaries, SddSummaries } from '../../src/agent/sdd_summary.js';
import { KotefConfig } from '../../src/core/config.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('SDD Summaries', () => {
    it('should generate summaries with reasonable size', async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), 'sdd-summary-test-'));
        const sddDir = path.join(tempDir, '.sdd');
        await fs.mkdir(sddDir, { recursive: true });

        // Create large SDD files to test summarization
        const projectMd = `# Project: Test App\n\n## Goal\nBuild a feature-rich web application.\n` + 'Lorem ipsum '.repeat(500);
        const architectMd = `# Architecture\n\n## Pattern\nMicroservices architecture.\n` + 'Lorem ipsum '.repeat(500);
        const bestPracticesMd = `# Best Practices\n\n## Testing\nUse TDD.\n` + 'Lorem ipsum '.repeat(300);

        await fs.writeFile(path.join(sddDir, 'project.md'), projectMd, 'utf-8');
        await fs.writeFile(path.join(sddDir, 'architect.md'), architectMd, 'utf-8');
        await fs.writeFile(path.join(sddDir, 'best_practices.md'), bestPracticesMd, 'utf-8');

        const cfg: KotefConfig = {
            apiKey: 'test-key',
            baseUrl: 'https://api.openai.com/v1',
            modelFast: 'gpt-4o-mini',
            modelStrong: 'gpt-4o',
            rootDir: tempDir,
            mockMode: true,
            dryRun: false,
            maxRunSeconds: 300,
            maxTokensPerRun: 100000,
            maxWebRequestsPerRun: 10
        };

        const summaries: SddSummaries = await buildSddSummaries(cfg, tempDir);

        // Verify summaries are significantly smaller than originals
        expect(summaries.projectSummary.length).toBeLessThan(projectMd.length / 2);
        expect(summaries.architectSummary.length).toBeLessThan(architectMd.length / 2);
        expect(summaries.bestPracticesSummary.length).toBeLessThan(bestPracticesMd.length / 2);

        // Verify summaries contain key information (mock mode returns predictable content)
        expect(summaries.projectSummary.length).toBeGreaterThan(0);
        expect(summaries.architectSummary.length).toBeGreaterThan(0);
        expect(summaries.bestPracticesSummary.length).toBeGreaterThan(0);

        // Cleanup
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should cache summaries to disk', async () => {
        const tempDir = await mkdtemp(path.join(tmpdir(), 'sdd-cache-test-'));
        const sddDir = path.join(tempDir, '.sdd');
        const cacheDir = path.join(sddDir, 'cache');
        await fs.mkdir(sddDir, { recursive: true });

        await fs.writeFile(path.join(sddDir, 'project.md'), '# Test', 'utf-8');
        await fs.writeFile(path.join(sddDir, 'architect.md'), '# Arch', 'utf-8');
        await fs.writeFile(path.join(sddDir, 'best_practices.md'), '# BP', 'utf-8');

        const cfg: KotefConfig = {
            apiKey: 'test-key',
            baseUrl: 'https://api.openai.com/v1',
            modelFast: 'gpt-4o-mini',
            modelStrong: 'gpt-4o',
            rootDir: tempDir,
            mockMode: true,
            dryRun: false,
            maxRunSeconds: 300,
            maxTokensPerRun: 100000,
            maxWebRequestsPerRun: 10
        };

        // First call should create cache
        await buildSddSummaries(cfg, tempDir);
        const cacheExists = await fs.access(path.join(cacheDir, 'summaries.json')).then(() => true).catch(() => false);
        expect(cacheExists).toBe(true);

        // Second call should use cache
        const summaries2 = await buildSddSummaries(cfg, tempDir);
        expect(summaries2.cacheTimestamp).toBeDefined();

        // Cleanup
        await fs.rm(tempDir, { recursive: true, force: true });
    });
});
