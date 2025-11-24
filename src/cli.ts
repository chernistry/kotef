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
        const startTime = Date.now();

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
            const endTime = Date.now();
            const durationSeconds = (endTime - startTime) / 1000;

            const summary: RunSummary = {
                status: result.done ? 'success' : 'partial',
                plan: result.plan ? JSON.stringify(result.plan, null, 2) : 'No plan',
                filesChanged: Object.keys(result.fileChanges || {}),
                tests: JSON.stringify(result.testResults || {}, null, 2),
                issues: (result.sdd as any)?.issues,
                durationSeconds
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

import readline from 'node:readline';
import { runSddOrchestration } from './agent/graphs/sdd_orchestrator.js';

// Helper for interactive prompts
function promptUser(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

program
    .command('chat')
    .description('Interactive coding session (Voyant-style)')
    .option('--root <path>', 'Project root directory', process.cwd())
    .option('--goal <text>', 'Initial goal')
    .action(async (options) => {
        const rootDir = path.resolve(options.root);
        const envConfig = loadConfig();
        const cfg: KotefConfig = {
            ...envConfig,
            rootDir,
        };

        console.log(`\n🤖 Kotef Interactive Session`);
        console.log(`   Project: ${rootDir}\n`);

        let goal = options.goal;
        let keepRunning = true;

        while (keepRunning) {
            // 1. Get Goal
            if (!goal) {
                goal = await promptUser('🎯 What would you like to do? ');
                if (!goal) continue;
            }

            console.log(`\n🚀 Goal: "${goal}"`);
            const confirm = await promptUser('   Proceed with this goal? [Y/n] ');
            if (confirm.toLowerCase() === 'n') {
                goal = undefined;
                continue;
            }

            // 2. Run SDD Orchestration
            console.log('\n🧠 Orchestrating SDD (Research -> Architect -> Tickets)...');
            try {
                // Check if .sdd exists
                const sddDir = path.join(rootDir, '.sdd');
                let sddExists = false;
                try {
                    await fs.access(sddDir);
                    sddExists = true;
                } catch {
                    sddExists = false;
                }

                if (!sddExists) {
                    // Bootstrap
                    await bootstrapSddForProject(cfg, rootDir, goal);
                } else {
                    // Just run orchestrator (or maybe we should always run orchestrator? 
                    // Orchestrator updates best_practices/architect/tickets.
                    // Bootstrap creates project.md THEN runs orchestrator.
                    // If project.md exists, we can just run orchestrator.
                    // But if we want to "re-bootstrap" (update project.md from goal), we might need logic.
                    // For now, if .sdd exists, assume project.md exists and just run orchestrator.
                    await runSddOrchestration(cfg, rootDir, goal);
                }
            } catch (e: any) {
                console.error('❌ SDD Orchestration failed:', e.message);
                goal = undefined;
                continue;
            }

            // 3. List Tickets
            const ticketsDir = path.join(rootDir, '.sdd/backlog/tickets/open');
            let tickets: string[] = [];
            try {
                tickets = (await fs.readdir(ticketsDir)).filter(f => f.endsWith('.md')).sort();
            } catch {
                // No tickets found
            }

            if (tickets.length === 0) {
                console.log('⚠️ No tickets generated. Check .sdd/architect.md for details.');
            } else {
                console.log(`\n📋 Generated Tickets:`);
                tickets.forEach(t => console.log(`   - ${t}`));

                // 4. Execute Tickets
                const proceed = await promptUser('\n⚡ Execute these tickets now? [Y/n] ');
                if (proceed.toLowerCase() !== 'n') {
                    for (const ticket of tickets) {
                        console.log(`\n🔨 Executing Ticket: ${ticket}`);

                        // Reuse run logic (simplified)
                        // We need to reload SDD artifacts for each ticket as they might change (though usually they don't during execution, but state does)
                        // Actually, we should probably call a shared function.
                        // For now, I'll duplicate the setup logic to avoid massive refactor of `run` command, 
                        // but I'll strip it down to essentials.

                        const runId = randomUUID();
                        const log = createLogger(runId); // We might want to silence file logs or keep them? Keep them.
                        const startTime = Date.now();

                        try {
                            const sddDir = path.join(rootDir, '.sdd');
                            const projectMd = await fs.readFile(path.join(sddDir, 'project.md'), 'utf-8').catch(() => '');
                            const architectMd = await fs.readFile(path.join(sddDir, 'architect.md'), 'utf-8').catch(() => '');
                            const bestPracticesMd = await fs.readFile(path.join(sddDir, 'best_practices.md'), 'utf-8').catch(() => '');
                            const ticketContent = await fs.readFile(path.join(ticketsDir, ticket), 'utf-8');

                            const initialState: Partial<AgentState> = {
                                messages: [{ role: 'user', content: `Execute ticket: ${ticket}` }], // Contextualize?
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

                            const graph = buildKotefGraph(cfg);
                            const result = await graph.invoke(initialState);

                            if (result.done) {
                                console.log(`✅ Ticket ${ticket} completed.`);
                                // Move ticket to closed? (Not implemented yet in graph, maybe manual?)
                                // For now, just log.
                            } else {
                                console.log(`⚠️ Ticket ${ticket} finished with partial status.`);
                            }

                            // Write report
                            const endTime = Date.now();
                            const durationSeconds = (endTime - startTime) / 1000;

                            const summary: RunSummary = {
                                status: result.done ? 'success' : 'partial',
                                plan: result.plan ? JSON.stringify(result.plan, null, 2) : 'No plan',
                                filesChanged: Object.keys(result.fileChanges || {}),
                                tests: JSON.stringify(result.testResults || {}, null, 2),
                                issues: (result.sdd as any)?.issues,
                                durationSeconds
                            };
                            await writeRunReport(sddDir, runId, summary, result as unknown as AgentState);

                        } catch (e: any) {
                            console.error(`❌ Failed to execute ticket ${ticket}:`, e.message);
                        }
                    }
                }
            }

            // 5. Loop
            goal = undefined; // Reset goal
            const another = await promptUser('\n🔄 Start another goal? [y/N] ');
            if (another.toLowerCase() !== 'y') {
                keepRunning = false;
            }
        }

        console.log('\n👋 Bye!');
    });

program.parse();
