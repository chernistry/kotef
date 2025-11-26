import { describe, it, afterEach, beforeEach, expect } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import util from 'node:util';
import os from 'node:os';

const execAsync = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe.skip('E2E Tests', () => {
    const scenariosDir = path.resolve(__dirname, 'scenarios');
    let tempDir: string; // Changed to let to allow reassignment
    const kotefBin = path.resolve(__dirname, '../bin/kotef');

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kotef-e2e-'));
    });

    afterEach(async () => {
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it('should solve hello-world ticket', async () => {
        const scenarioName = 'hello-world';
        const srcDir = path.join(scenariosDir, scenarioName);
        const destDir = path.join(tempDir, scenarioName);
        const goal = "Add a subtract function";

        // Copy scenario
        await fs.cp(srcDir, destDir, { recursive: true });

        // Run kotef chat command
        const command = `${kotefBin} chat --root "${destDir}" --goal "${goal}" --auto-approve`;

        const { stdout, stderr } = await execAsync(command, { env: { ...process.env, KOTEF_API_KEY: 'dummy', KOTEF_MOCK_MODE: 'true' } });

        if (stderr) {
            console.error('E2E Error:', stderr);
        }

        // Verify output contains success indicators
        expect(stdout).toContain('SDD Orchestration Complete');
        expect(stdout).toContain('Execution Complete');

        // Assertions
        const indexContent = await fs.readFile(path.join(destDir, 'src/index.ts'), 'utf-8');
        expect(indexContent).toContain('export function subtract');

        const runsDir = path.join(destDir, '.sdd/runs');
        const runs = await fs.readdir(runsDir);
        expect(runs.length).toBeGreaterThan(0);
    }, 60000);

    it('should bootstrap SDD for new project', async () => {
        const scenarioName = 'hello-world-nosdd';
        const srcDir = path.join(scenariosDir, scenarioName);
        const destDir = path.join(tempDir, scenarioName);

        // Copy scenario
        await fs.cp(srcDir, destDir, { recursive: true });

        // Run kotef chat
        // We pipe "n" to answer "Start another goal?" prompt
        const command = `echo "n" | ${kotefBin} chat --root "${destDir}" --goal "Add a subtract function" --auto-approve`;

        console.log(`Running: ${command}`);
        const { stdout, stderr } = await execAsync(command, { env: { ...process.env, KOTEF_API_KEY: 'dummy', KOTEF_MOCK_MODE: 'true' } });

        console.log('STDOUT:', stdout);
        if (stderr) console.error('STDERR:', stderr);

        // Assertions
        // Verify SDD created
        const sddExists = await fs.access(path.join(destDir, '.sdd')).then(() => true).catch(() => false);
        expect(sddExists).toBe(true);

        const projectMd = await fs.readFile(path.join(destDir, '.sdd/project.md'), 'utf-8');
        expect(projectMd).toContain('# Project: Mock Project'); // From mock bootstrap
    }, 60000);
});
