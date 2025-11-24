import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { bootstrapSddForProject } from '../../src/agent/bootstrap.js';
import { KotefConfig } from '../../src/core/config.js';

describe('SDD Bootstrap', () => {
    let tempDir: string;

    afterEach(async () => {
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it('should bootstrap project with SDD artifacts', async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kotef-bootstrap-test-'));

        // Create dummy package.json
        await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({
            dependencies: { 'typescript': '^5.0.0' }
        }));

        const config: KotefConfig = {
            apiKey: 'dummy',
            mockMode: true,
            modelFast: 'gpt-4o-mini',
            modelStrong: 'gpt-4o',
            maxRunSeconds: 60,
            maxTokensPerRun: 1000,
            maxWebRequestsPerRun: 5
        };

        await bootstrapSddForProject(config, tempDir, 'Build a CLI tool');

        // Verify project.md
        const projectMdPath = path.join(tempDir, '.sdd/project.md');
        const projectMdExists = await fs.stat(projectMdPath).then(() => true).catch(() => false);
        assert.ok(projectMdExists, '.sdd/project.md should exist');

        const projectContent = await fs.readFile(projectMdPath, 'utf-8');
        assert.ok(projectContent.includes('Build a CLI tool'), 'project.md should contain goal');
        assert.ok(projectContent.includes('typescript'), 'project.md should contain stack hints');

        // Verify other artifacts (via orchestrator)
        const bestPracticesPath = path.join(tempDir, '.sdd/best_practices.md');
        const bestPracticesExists = await fs.stat(bestPracticesPath).then(() => true).catch(() => false);
        assert.ok(bestPracticesExists, '.sdd/best_practices.md should exist');

        const architectPath = path.join(tempDir, '.sdd/architect.md');
        const architectExists = await fs.stat(architectPath).then(() => true).catch(() => false);
        assert.ok(architectExists, '.sdd/architect.md should exist');
    });
});
