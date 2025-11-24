import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

type EvalTask = {
    id: string;
    goal: string;
    fixtureDir: string;
    expected?: {
        testsCommand?: string;
        notes?: string;
    };
};

type CommandResult = {
    status: 'ok' | 'failed' | 'skipped';
    exitCode: number | null;
    durationMs: number;
    stdout: string;
    stderr: string;
    error?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

async function runCommand(cmd: string, args: string[], cwd: string): Promise<CommandResult> {
    const start = Date.now();
    return await new Promise((resolve) => {
        const child = spawn(cmd, args, { cwd, env: process.env, shell: false });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));

        child.on('close', (code) => {
            resolve({
                status: code === 0 ? 'ok' : 'failed',
                exitCode: code,
                durationMs: Date.now() - start,
                stdout,
                stderr
            });
        });
        child.on('error', (err) => {
            resolve({
                status: 'failed',
                exitCode: -1,
                durationMs: Date.now() - start,
                stdout,
                stderr,
                error: err.message
            });
        });
    });
}

async function loadTasks(): Promise<EvalTask[]> {
    const tasksDir = path.join(ROOT, 'devdata/tasks');
    const files = await fs.readdir(tasksDir);
    const tasks: EvalTask[] = [];
    for (const file of files.filter((f) => f.endsWith('.json')).sort()) {
        const raw = await fs.readFile(path.join(tasksDir, file), 'utf8');
        tasks.push(JSON.parse(raw));
    }
    return tasks;
}

async function copyFixture(src: string, dest: string) {
    await fs.cp(src, dest, { recursive: true });
}

function overallStatus(agent?: CommandResult, tests?: CommandResult): 'success' | 'failed' | 'skipped' {
    if (agent?.status === 'failed') return 'failed';
    if (tests?.status === 'failed') return 'failed';
    if (agent?.status === 'skipped') return 'skipped';
    return 'success';
}

async function main() {
    const tasks = await loadTasks();
    if (tasks.length === 0) {
        console.error('No tasks found in devdata/tasks.');
        process.exit(1);
    }

    const cliPath = path.join(ROOT, 'dist/src/cli.js');
    const cliExists = await fs.access(cliPath).then(() => true).catch(() => false);
    const skipAgent = process.env.KOTEF_EVAL_SKIP_AGENT === '1';

    const resultsDir = path.join(ROOT, 'devdata/results');
    await fs.mkdir(resultsDir, { recursive: true });

    const runId = randomUUID();
    const runResults: any[] = [];

    console.log(`Running ${tasks.length} eval tasks (runId=${runId})`);

    for (const task of tasks) {
        const workDir = await fs.mkdtemp(path.join(tmpdir(), `kotef-eval-${task.id}-`));
        const fixtureAbs = path.join(ROOT, task.fixtureDir);
        await copyFixture(fixtureAbs, workDir);

        let agentResult: CommandResult | undefined;
        if (skipAgent) {
            agentResult = {
                status: 'skipped',
                exitCode: null,
                durationMs: 0,
                stdout: '',
                stderr: '',
                error: 'Skipped by KOTEF_EVAL_SKIP_AGENT=1'
            };
        } else if (!cliExists) {
            agentResult = {
                status: 'failed',
                exitCode: -1,
                durationMs: 0,
                stdout: '',
                stderr: '',
                error: 'dist/src/cli.js not found. Run `npm run build` first.'
            };
        } else {
            agentResult = await runCommand(process.execPath, [
                cliPath,
                'run',
                '--root',
                workDir,
                '--goal',
                task.goal,
                '--max-time',
                '240'
            ], ROOT);
        }

        let testResult: CommandResult | undefined;
        if (task.expected?.testsCommand) {
            testResult = await runCommand('sh', ['-c', task.expected.testsCommand], workDir);
        }

        const status = overallStatus(agentResult, testResult);

        runResults.push({
            taskId: task.id,
            goal: task.goal,
            workDir,
            agent: agentResult,
            tests: testResult,
            status
        });

        console.log(
            `• ${task.id} -> agent: ${agentResult?.status ?? 'n/a'} (code=${agentResult?.exitCode}), tests: ${testResult?.status ?? 'n/a'} (code=${testResult?.exitCode}), status=${status}`
        );
    }

    const outPath = path.join(resultsDir, `run-${Date.now()}.json`);
    await fs.writeFile(
        outPath,
        JSON.stringify(
            {
                runId,
                createdAt: new Date().toISOString(),
                results: runResults
            },
            null,
            2
        ),
        'utf8'
    );

    const successCount = runResults.filter((r) => r.status === 'success').length;
    console.log(`\nSummary: ${successCount}/${runResults.length} tasks succeeded. Results: ${outPath}`);
}

main().catch((err) => {
    console.error('Eval harness failed:', err);
    process.exit(1);
});
