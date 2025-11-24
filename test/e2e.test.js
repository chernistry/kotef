import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
describe('E2E Tests', () => {
    const scenariosDir = path.resolve(__dirname, 'scenarios');
    const tempDir = path.resolve(__dirname, '../temp-e2e');
    const kotefBin = path.resolve(__dirname, '../bin/kotef');
    before(async () => {
        await fs.mkdir(tempDir, { recursive: true });
    });
    after(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it('should solve hello-world ticket', async () => {
        const scenarioName = 'hello-world';
        const srcDir = path.join(scenariosDir, scenarioName);
        const destDir = path.join(tempDir, scenarioName);
        // Copy scenario
        await fs.cp(srcDir, destDir, { recursive: true });
        // Run kotef
        // We use KOTEF_MOCK_MODE=true to ensure deterministic execution
        const command = `KOTEF_API_KEY=dummy KOTEF_MOCK_MODE=true ${kotefBin} run --root ${destDir} --ticket 01-add-function --goal "Add a subtract function"`;
        console.log(`Running: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        console.log('STDOUT:', stdout);
        if (stderr)
            console.error('STDERR:', stderr);
        // Assertions
        const indexContent = await fs.readFile(path.join(destDir, 'src/index.ts'), 'utf-8');
        assert.ok(indexContent.includes('export function subtract'), 'Function should be added');
        const runsDir = path.join(destDir, '.sdd/runs');
        const runs = await fs.readdir(runsDir);
        assert.ok(runs.length > 0, 'Run report should be created');
    });
    it('should bootstrap SDD for new project', async () => {
        const scenarioName = 'hello-world-nosdd';
        const srcDir = path.join(scenariosDir, scenarioName);
        const destDir = path.join(tempDir, scenarioName);
        // Copy scenario
        await fs.cp(srcDir, destDir, { recursive: true });
        // Run kotef with goal to trigger bootstrap
        const command = `KOTEF_API_KEY=dummy KOTEF_MOCK_MODE=true ${kotefBin} run --root ${destDir} --goal "Add a subtract function"`;
        console.log(`Running: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        console.log('STDOUT:', stdout);
        if (stderr)
            console.error('STDERR:', stderr);
        // Assertions
        // Check if .sdd was created
        const sddExists = await fs.access(path.join(destDir, '.sdd')).then(() => true).catch(() => false);
        assert.ok(sddExists, '.sdd directory should be created');
        const projectMd = await fs.readFile(path.join(destDir, '.sdd/project.md'), 'utf-8');
        assert.ok(projectMd.includes('# Mock Project'), 'Project.md should be bootstrapped');
    });
});
