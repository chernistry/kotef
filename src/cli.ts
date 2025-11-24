import { Command } from 'commander';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadConfig, KotefConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { buildKotefGraph } from './agent/graph.js';
import { bootstrapSddForProject } from './agent/bootstrap.js';
import { writeRunReport, RunSummary } from './agent/run_report.js';
import { AgentState } from './agent/state.js';
import { randomUUID } from 'node:crypto';
import { loadPrompt } from './core/prompts.js';

const program = new Command();

program
    .name('kotef')
    .description('Autonomous AI coding agent')
    .version('0.1.0');

program
    .command('run')
    .description('Run the agent on a project')
    .option('--root <path>', 'Project root directory', process.cwd())
    .option('--ticket <id>', 'Ticket ID to work on')
    .option('--goal <text>', 'Natural language goal (triggers bootstrap if no SDD)')
    .option('--dry-run', 'Run in dry-run mode (no file writes)', false)
    .option('--max-time <seconds>', 'Maximum run time in seconds')
    .option('--max-tokens <count>', 'Maximum tokens per run')
    .action(async (options) => {
        const runId = randomUUID();
        const rootDir = path.resolve(options.root);

        // Load config with overrides
        const envConfig = loadConfig();
        const cfg: KotefConfig = {
            ...envConfig,
            rootDir,
            dryRun: options.dryRun || envConfig.dryRun,
            maxRunSeconds: options.maxTime ? parseInt(options.maxTime) : envConfig.maxRunSeconds,
            maxTokensPerRun: options.maxTokens ? parseInt(options.maxTokens) : envConfig.maxTokensPerRun,
        };

        const log = createLogger(runId);
        log.info('Starting kotef run', { runId, rootDir, goal: options.goal, ticket: options.ticket });

        try {
            const sddDir = path.join(rootDir, '.sdd');
            let sddExists = false;
            try {
                await fs.access(sddDir);
                sddExists = true;
            } catch {
                sddExists = false;
            }

            // Bootstrap if needed
            if (!sddExists) {
                if (options.goal) {
                    log.info('SDD directory not found. Bootstrapping from goal...');
                    await bootstrapSddForProject(cfg, rootDir, options.goal);
                    sddExists = true;
                } else {
                    console.error('Error: .sdd directory not found and no --goal provided.');
                    console.error('Please provide a --goal to bootstrap the project, or run inside an existing SDD project.');
                    process.exit(1);
                }
            }

            // Load SDD artifacts
            log.info('Loading SDD artifacts...');
            const projectMd = await fs.readFile(path.join(sddDir, 'project.md'), 'utf-8').catch(() => '');
            const architectMd = await fs.readFile(path.join(sddDir, 'architect.md'), 'utf-8').catch(() => '');
            const bestPracticesMd = await fs.readFile(path.join(sddDir, 'best_practices.md'), 'utf-8').catch(() => '');

            let ticketContent = '';
            if (options.ticket) {
                // Try to find ticket file
                // This is a simplification, ideally we search for matching ID
                const ticketsDir = path.join(sddDir, 'backlog/tickets/open');
                const files = await fs.readdir(ticketsDir).catch(() => []);
                const ticketFile = files.find(f => f.startsWith(options.ticket));
                if (ticketFile) {
                    ticketContent = await fs.readFile(path.join(ticketsDir, ticketFile), 'utf-8');
                } else {
                    log.warn(`Ticket ${options.ticket} not found.`);
                }
            }

            // Initialize State
            const initialState: Partial<AgentState> = {
                messages: options.goal ? [{ role: 'user', content: options.goal }] : [],
                sdd: {
                    project: projectMd,
                    architect: architectMd,
                    bestPractices: bestPracticesMd,
                    ticket: ticketContent
                },
                hasSdd: true,
                fileChanges: {},
                testResults: {},
                researchResults: []
            };

            // Run Graph
            log.info('Building and running agent graph...');
            const graph = buildKotefGraph(cfg);
            const result = await graph.invoke(initialState);

            log.info('Run completed.', { done: result.done });

            // Generate Report
            const summary: RunSummary = {
                status: result.done ? 'success' : 'partial',
                plan: result.plan ? JSON.stringify(result.plan, null, 2) : 'No plan',
                filesChanged: Object.keys(result.fileChanges || {}),
                tests: JSON.stringify(result.testResults || {}, null, 2),
                issues: (result.sdd as any)?.issues
            };

            await writeRunReport(sddDir, runId, summary, result as unknown as AgentState);

        } catch (error: any) {
            log.error('Run failed', { error: error.message, stack: error.stack });
            console.error('Run failed:', error.message);

            // Try to write failure report
            try {
                const sddDir = path.join(rootDir, '.sdd');
                await writeRunReport(sddDir, runId, {
                    status: 'failed',
                    plan: '',
                    filesChanged: [],
                    tests: '',
                    error: error.message
                });
            } catch (e) {
                // Ignore
            }

            process.exit(1);
        }
    });

program.parse();
