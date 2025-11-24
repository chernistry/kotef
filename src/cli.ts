import { Command } from 'commander';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import MarkdownIt from 'markdown-it';

import { loadConfig, KotefConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { buildKotefGraph } from './agent/graph.js';
import { bootstrapSddForProject } from './agent/bootstrap.js';
import { writeRunReport, RunSummary } from './agent/run_report.js';
import { AgentState } from './agent/state.js';

const program = new Command();

type Styler = (value: string) => string;
const identity: Styler = (value: string) => value;

interface BlockParts {
    top: string;
    body: string;
    bottom: string;
}

const FRAME_BAR = '─'.repeat(44);

const md = new MarkdownIt({
    breaks: true,
    linkify: true
});

function createBlock(title: string, message: string, accent: Styler, body: Styler): BlockParts {
    const lines = message.split('\n').map(line => (line.length === 0 ? ' ' : line));
    const topPlain = `┌─ ${title.toUpperCase()} ${FRAME_BAR}`;
    const bottomPlain = `└${'─'.repeat(Math.max(topPlain.length - 1, 0))}`;
    const prefixed = lines
        .map(line => `${accent('│')} ${body(line)}`)
        .join('\n');
    return {
        top: accent(topPlain),
        body: prefixed,
        bottom: accent(bottomPlain)
    };
}

function renderMarkdownToTerminal(markdown: string): string {
    const html = md.render(markdown);

    const formatted = html
        // Headers
        .replace(/<h1>(.*?)<\/h1>/gi, `${chalk.bold.blue('\n$1\n')}${'='.repeat(50)}`)
        .replace(/<h2>(.*?)<\/h2>/gi, `${chalk.bold.cyan('\n$1\n')}${'-'.repeat(30)}`)
        .replace(/<h3>(.*?)<\/h3>/gi, chalk.bold.yellow('\n$1'))
        .replace(/<h[4-6]>(.*?)<\/h[4-6]>/gi, chalk.bold.magenta('\n$1'))
        // Bold / italic
        .replace(/<strong>(.*?)<\/strong>/gi, chalk.bold('$1'))
        .replace(/<b>(.*?)<\/b>/gi, chalk.bold('$1'))
        .replace(/<em>(.*?)<\/em>/gi, chalk.italic('$1'))
        .replace(/<i>(.*?)<\/i>/gi, chalk.italic('$1'))
        // Code
        .replace(/<code>(.*?)<\/code>/gi, chalk.bgGray.white(' $1 '))
        .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (_m: string, code: string) => {
            return '\n' + chalk.bgGray.white(' ' + code.trim() + ' ') + '\n';
        })
        // Links
        .replace(/<a href="([^"]+)">(.*?)<\/a>/gi, (_m: string, href: string, text: string) => {
            return chalk.blue.underline(text) + ' ' + chalk.gray('(' + href + ')');
        })
        // Lists
        .replace(/<ul>/gi, '')
        .replace(/<\/ul>/gi, '')
        .replace(/<ol>/gi, '')
        .replace(/<\/ol>/gi, '')
        .replace(/<li>(.*?)<\/li>/gi, '  • $1\n')
        // Paragraphs
        .replace(/<p>(.*?)<\/p>/gi, '$1\n')
        // Line breaks
        .replace(/<br\s*\/?>(?!\n)/gi, '\n')
        // Strip remaining tags
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

    return formatted;
}

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
    .option('--yolo', 'Aggressive mode: minimal guardrails, more tool turns', false)
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
            let ticketFileName: string | undefined;
            if (options.ticket) {
                // Try to find ticket file
                // This is a simplification, ideally we search for matching ID
                const ticketsDir = path.join(sddDir, 'backlog/tickets/open');
                const files = await fs.readdir(ticketsDir).catch(() => []);
                const ticketFile = files.find(f => f.startsWith(options.ticket));
                if (ticketFile) {
                    ticketFileName = ticketFile;
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
                // In YOLO mode we bias the planner/coder towards the most aggressive profile.
                runProfile: options.yolo ? 'yolo' : undefined,
                fileChanges: {},
                testResults: {},
                researchResults: []
            };

            // Run Graph
            log.info('Building and running agent graph...');
            const graph = buildKotefGraph(cfg);
            const result = await graph.invoke(initialState);

            log.info('Run completed.', { done: result.done });

            // If a specific ticket was executed and run completed successfully,
            // move it from backlog/tickets/open → backlog/tickets/closed.
            if (result.done && ticketFileName) {
                try {
                    const openDir = path.join(sddDir, 'backlog/tickets/open');
                    const closedDir = path.join(sddDir, 'backlog/tickets/closed');
                    await fs.mkdir(closedDir, { recursive: true });
                    const src = path.join(openDir, ticketFileName);
                    const dest = path.join(closedDir, ticketFileName);
                    await fs.rename(src, dest);
                    log.info('Ticket moved to closed backlog', { ticket: ticketFileName });
                } catch (e: any) {
                    log.warn('Failed to move ticket to closed backlog', {
                        ticket: ticketFileName,
                        error: e?.message
                    });
                }
            }

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

import { runSddOrchestration } from './agent/graphs/sdd_orchestrator.js';

program
    .command('chat')
    .description('Interactive coding session (Voyant-style, Navan-like CLI)')
    .option('--root <path>', 'Project root directory', process.cwd())
    .option('--goal <text>', 'Initial goal')
    .option('--yolo', 'Aggressive mode: minimal guardrails, more tool turns', false)
    .action(async (options) => {
        const rootDir = path.resolve(options.root);
        const envConfig = loadConfig();
        const cfg: KotefConfig = {
            ...envConfig,
            rootDir
        };

        const rl = readline.createInterface({ input, output });

        console.log(
            chalk.cyan(`
  ██╗  ██╗ ██████╗ ████████╗███████╗███████╗███████╗
  ██║ ██╔╝██╔═══██╗╚══██╔══╝██╔════╝██╔════╝██╔════╝
  █████╔╝ ██║   ██║   ██║   █████╗  ███████╗█████╗  
  ██╔═██╗ ██║   ██║   ██║   ██╔══╝  ╚════██║██╔══╝  
  ██║  ██╗╚██████╔╝   ██║   ███████╗███████║███████╗
  ╚═╝  ╚═╝ ╚═════╝    ╚═╝   ╚══════╝╚══════╝╚══════╝
`)
        );
        console.log(chalk.yellow.bold('🤖 KOTEF Coding Agent CLI — SDD-driven code edits'));
        console.log(chalk.gray('─'.repeat(72)));
        console.log(
            chalk.white(
                chalk.green('• Give me a goal, I bootstrap .sdd and tickets\n') +
                chalk.green('• Then I execute tickets inside your repo (like Codex/Claude Code)\n') +
                chalk.blue('Commands: ') +
                chalk.blue('/exit') +
                chalk.gray(' to quit\n')
            )
        );
        console.log(chalk.gray('─'.repeat(72)));
        console.log(chalk.gray(`Project root: ${rootDir}\n`));

        let keepRunning = true;

        while (keepRunning) {
            const goal =
                options.goal ||
                (await rl.question(chalk.blue.bold('You> '))).trim();

            if (!goal) {
                continue;
            }
            if (goal.toLowerCase() === '/exit') {
                break;
            }

            const userBlock = createBlock('You', goal, chalk.blueBright, chalk.white);
            console.log();
            console.log(userBlock.top);
            if (userBlock.body.length > 0) {
                console.log(userBlock.body);
            }
            console.log(userBlock.bottom);

            // Orchestrate SDD (research → architect → tickets)
            console.log(chalk.gray('\n┌─ ORCHESTRATOR ' + '─'.repeat(40)));
            console.log(chalk.gray('│ Running SDD bootstrap/orchestration...'));
            console.log(chalk.gray('└' + '─'.repeat(53)));

            try {
                const sddDir = path.join(rootDir, '.sdd');
                let sddExists = false;
                try {
                    await fs.access(sddDir);
                    sddExists = true;
                } catch {
                    sddExists = false;
                }

                if (!sddExists) {
                    await bootstrapSddForProject(cfg, rootDir, goal);
                } else {
                    await runSddOrchestration(cfg, rootDir, goal);
                }
            } catch (e: any) {
                const msg = e?.message || String(e);
                console.log(chalk.red(`❌ SDD Orchestration failed: ${msg}`));
                options.goal = undefined;
                continue;
            }

            // List tickets
            const ticketsDir = path.join(rootDir, '.sdd/backlog/tickets/open');
            let tickets: string[] = [];
            try {
                tickets = (await fs.readdir(ticketsDir)).filter(f => f.endsWith('.md')).sort();
            } catch {
                tickets = [];
            }

            if (tickets.length === 0) {
                console.log(chalk.yellow('\n⚠️  No tickets generated. Check .sdd/architect.md for details.\n'));
                options.goal = undefined;
                continue;
            }

            console.log(chalk.green('\n📋 Generated tickets:'));
            tickets.forEach(t => console.log(chalk.green(`   • ${t}`)));

            const proceed = (
                await rl.question(chalk.yellow('\nExecute these tickets now? [Y/n] '))
            ).trim().toLowerCase();

            if (proceed === 'n') {
                options.goal = undefined;
                continue;
            }

            // Execute tickets sequentially
            for (const ticket of tickets) {
                console.log(chalk.cyan(`\n🔨 Executing ticket: ${ticket}`));

                const runId = randomUUID();
                const log = createLogger(runId);
                const startTime = Date.now();

                try {
                    const sddDir = path.join(rootDir, '.sdd');
                    const projectMd = await fs.readFile(path.join(sddDir, 'project.md'), 'utf-8').catch(() => '');
                    const architectMd = await fs.readFile(path.join(sddDir, 'architect.md'), 'utf-8').catch(() => '');
                    const bestPracticesMd = await fs.readFile(path.join(sddDir, 'best_practices.md'), 'utf-8').catch(() => '');
                    const ticketContent = await fs.readFile(path.join(ticketsDir, ticket), 'utf-8');

                    const initialState: Partial<AgentState> = {
                        messages: [{ role: 'user', content: `Execute ticket: ${ticket}` }],
                        sdd: {
                            project: projectMd,
                            architect: architectMd,
                            bestPractices: bestPracticesMd,
                            ticket: ticketContent
                        },
                        hasSdd: true,
                        runProfile: options.yolo ? 'yolo' : undefined,
                        fileChanges: {},
                        testResults: {},
                        researchResults: []
                    };

                    const graph = buildKotefGraph(cfg);
                    const result = await graph.invoke(initialState);

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

                    const reportText = `Status: ${summary.status}\n` +
                        `Files changed: ${summary.filesChanged.join(', ') || 'none'}\n` +
                        `Duration: ${durationSeconds.toFixed(2)}s`;

                    const assistantBlock = createBlock(
                        'Kotef',
                        renderMarkdownToTerminal(reportText),
                        chalk.greenBright,
                        identity
                    );
                    console.log();
                    console.log(assistantBlock.top);
                    if (assistantBlock.body.length > 0) {
                        console.log(assistantBlock.body);
                    }
                    console.log(assistantBlock.bottom);

                    if (result.done) {
                        console.log(chalk.green(`✅ Ticket ${ticket} completed.`));
                        // Move ticket to closed backlog
                        try {
                            const closedDir = path.join(sddDir, 'backlog/tickets/closed');
                            await fs.mkdir(closedDir, { recursive: true });
                            const src = path.join(ticketsDir, ticket);
                            const dest = path.join(closedDir, ticket);
                            await fs.rename(src, dest);
                            console.log(chalk.gray(`📁 Moved ${ticket} → backlog/tickets/closed`));
                        } catch (moveErr: any) {
                            console.warn(
                                chalk.yellow(
                                    `⚠️  Failed to move ${ticket} to closed backlog: ${moveErr?.message}`
                                )
                            );
                        }
                    } else {
                        console.log(chalk.yellow(`⚠️  Ticket ${ticket} finished with partial/blocked status.`));
                    }
                } catch (e: any) {
                    log.error('Ticket execution failed', { ticket, error: e?.message });
                    console.error(chalk.red(`❌ Failed to execute ticket ${ticket}: ${e?.message}`));
                }
            }

            options.goal = undefined;
            const another = (await rl.question(chalk.gray('\nStart another goal? [y/N] ')))
                .trim()
                .toLowerCase();
            if (another !== 'y') {
                keepRunning = false;
            }
        }

        rl.close();
        console.log(chalk.gray('\n👋 Bye!'));
    });

program.parse();
