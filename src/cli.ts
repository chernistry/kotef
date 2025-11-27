import { runSddOrchestration } from './agent/graphs/sdd_orchestrator.js';

import { Command } from 'commander';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import MarkdownIt from 'markdown-it';

import { loadConfig, KotefConfig } from './core/config.js';
import { createLogger } from './core/logger.js';
import { console_log } from './core/console.js';
import { buildKotefGraph } from './agent/graph.js';
import { bootstrapSddForProject } from './agent/bootstrap.js';
import { buildSddSummaries } from './agent/sdd_summary.js';
import { writeRunReport, RunSummary } from './agent/run_report.js';
import { AgentState } from './agent/state.js';
import { estimateTaskScope } from './agent/task_scope.js';
import { ensureGitRepo, commitTicketRun, extractTicketTitle } from './tools/git.js';
import { appendAdr, syncAssumptions } from './agent/utils/adr.js';
import { computeFlowMetrics } from './agent/utils/flow_metrics.js';
import { homedir } from 'node:os';

/**
 * Expand tilde (~) in paths to home directory
 */
function expandTilde(filepath: string): string {
    if (filepath.startsWith('~/') || filepath === '~') {
        return filepath.replace('~', homedir());
    }
    return filepath;
}

/**
 * Find the next open ticket with the lowest number
 */
async function findNextTicket(rootDir: string): Promise<{ id: string; path: string } | null> {
    const openDir = path.join(rootDir, '.sdd', 'backlog', 'tickets', 'open');
    try {
        const files = await fs.readdir(openDir);
        const ticketFiles = files.filter(f => f.endsWith('.md') && /^\d+/.test(f));
        if (ticketFiles.length === 0) return null;

        // Sort by ticket number
        ticketFiles.sort((a, b) => {
            const numA = parseInt(a.match(/^(\d+)/)?.[1] || '999999');
            const numB = parseInt(b.match(/^(\d+)/)?.[1] || '999999');
            return numA - numB;
        });

        const nextFile = ticketFiles[0];
        const ticketId = nextFile.match(/^(\d+)/)?.[1] || '';
        return {
            id: ticketId,
            path: path.join(openDir, nextFile)
        };
    } catch {
        return null;
    }
}

const program = new Command();

type Styler = (value: string) => string;
const identity: Styler = (value: string) => value;

interface BlockParts {
    top: string;
    body: string;
    bottom: string;
}

const FRAME_BAR = '─'.repeat(44);
const PIPELINE_BAR = '─'.repeat(40);
const PIPELINE_TOP_TEXT = `┌─ PIPELINE ${PIPELINE_BAR}`;
const PIPELINE_BOTTOM_TEXT = `└${'─'.repeat(Math.max(PIPELINE_TOP_TEXT.length - 1, 0))}`;
const PIPELINE_TOP = chalk.gray(PIPELINE_TOP_TEXT);
const PIPELINE_BOTTOM = chalk.gray(PIPELINE_BOTTOM_TEXT);

const md = new MarkdownIt({
    breaks: true,
    linkify: true
});

function decodeHtmlEntities(value: string): string {
    const named: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#34;': '"',
        '&#39;': "'",
        '&apos;': "'",
        '&nbsp;': ' ',
        '&ldquo;': '"',
        '&rdquo;': '"',
        '&lsquo;': "'",
        '&rsquo;': "'"
    };

    return value
        .replace(/&#x([0-9a-f]+);/gi, (_match: string, hex: string) => {
            return String.fromCodePoint(parseInt(hex, 16));
        })
        .replace(/&#(\d+);/g, (_match: string, dec: string) => {
            return String.fromCodePoint(Number.parseInt(dec, 10));
        })
        .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, (entity: string): string => {
            if (Object.prototype.hasOwnProperty.call(named, entity)) {
                return named[entity]!;
            }
            return entity;
        });
}

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
        .replace(/<h1>(.*?)<\/h1>/gi, chalk.bold.blue('\n$1\n') + '='.repeat(50))
        .replace(/<h2>(.*?)<\/h2>/gi, chalk.bold.cyan('\n$1\n') + '-'.repeat(30))
        .replace(/<h3>(.*?)<\/h3>/gi, chalk.bold.yellow('\n$1'))
        .replace(/<h[4-6]>(.*?)<\/h[4-6]>/gi, chalk.bold.magenta('\n$1'))
        // Bold and italic
        .replace(/<strong>(.*?)<\/strong>/gi, chalk.bold('$1'))
        .replace(/<b>(.*?)<\/b>/gi, chalk.bold('$1'))
        .replace(/<em>(.*?)<\/em>/gi, chalk.italic('$1'))
        .replace(/<i>(.*?)<\/i>/gi, chalk.italic('$1'))
        // Code
        .replace(/<code>(.*?)<\/code>/gi, chalk.bgGray.white(' $1 '))
        .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (_m: string, code: string) => {
            return '\n' + chalk.bgGray.white(' ' + code.trim() + ' ') + '\n';
        })
        // Links: show both text and URL
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
        // Clean up remaining HTML tags
        .replace(/<\/?[^>]+(>|$)/g, '')
        // Normalize whitespace and line breaks
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

    return decodeHtmlEntities(formatted);
}

// Get streaming delay from environment or use default
const STREAMING_DELAY_MS = parseInt(process.env.CLI_STREAMING_DELAY_MS || '2');

async function streamText(text: string, delayMs = STREAMING_DELAY_MS) {
    for (const char of text) {
        process.stdout.write(char);
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }
}

type PipelineStageKey = 'research' | 'plan' | 'code' | 'verify' | 'finalize';

class Spinner {
    private readonly frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private readonly stageOrder: PipelineStageKey[] = [
        'research',
        'plan',
        'code',
        'verify',
        'finalize'
    ];
    private readonly stageLabels: Record<PipelineStageKey, string> = {
        research: 'Researching codebase...',
        plan: 'Planning changes...',
        code: 'Writing code...',
        verify: 'Running tests...',
        finalize: 'Finalizing changes...'
    };
    private interval: NodeJS.Timeout | null = null;
    private currentFrame = 0;
    private currentStage: PipelineStageKey = 'research';
    private customStatus: string | null = null;
    private customStatusTime = 0;
    private readonly CUSTOM_STATUS_TIMEOUT = 3000; // 3 seconds

    start() {
        this.currentFrame = 0;
        this.customStatus = null;
        this.customStatusTime = 0;
        this.currentStage = 'research';
        if (this.interval) clearInterval(this.interval);
        this.interval = setInterval(() => {
            const displayStatus = this.getCurrentDisplayStatus();
            const frame = chalk.yellow(this.frames[this.currentFrame]);
            const prefix = chalk.gray('│');
            const text = chalk.gray(displayStatus);
            process.stdout.write(`\r\x1b[2K${prefix} ${frame} ${text}`);
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        }, 80);
    }

    setStage(stage: PipelineStageKey) {
        if (this.stageOrder.includes(stage)) {
            this.currentStage = stage;
            if (this.interval && !this.customStatus) {
                const frame = chalk.yellow(this.frames[this.currentFrame]);
                const prefix = chalk.gray('│');
                const text = chalk.gray(this.getStageStatus());
                process.stdout.write(`\r\x1b[2K${prefix} ${frame} ${text}`);
            }
        }
    }

    setStatus(status: string) {
        const newStatus = status || 'Processing...';
        this.customStatus = newStatus;
        this.customStatusTime = Date.now();
        if (this.interval) {
            const frame = chalk.yellow(this.frames[this.currentFrame]);
            const prefix = chalk.gray('│');
            const text = chalk.gray(newStatus);
            process.stdout.write(`\r\x1b[2K${prefix} ${frame} ${text}`);
        }
    }

    private getStageStatus(): string {
        return this.stageLabels[this.currentStage] || 'Processing...';
    }

    private getCurrentDisplayStatus(): string {
        if (this.customStatus && Date.now() - this.customStatusTime < this.CUSTOM_STATUS_TIMEOUT) {
            return this.customStatus;
        }
        if (this.customStatus) {
            this.customStatus = null;
        }
        return this.getStageStatus();
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.customStatus = null;
            this.customStatusTime = 0;
            process.stdout.write('\r'.padEnd(50, ' ') + '\r');
        }
        this.currentStage = 'research';
    }
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
    .option('--profile <profile>', 'Execution profile (strict, fast, smoke, yolo)')
    .option('--max-coder-turns <count>', 'Hard cap on coder tool-loop turns (default: profile-based)')
    .option('--yolo', 'Aggressive mode: minimal guardrails, more tool turns', false)
    .option('--auto-approve', 'Skip interactive approval', false)
    .option('--continue', 'Auto-continue to next ticket after completion', false)
    .option('--nogit', 'Disable git integration', false)
    .action(async (options) => {
        const runId = randomUUID();
        const rootDir = path.resolve(expandTilde(options.root));

        // Load config with overrides
        const envConfig = loadConfig();
        const cfg: KotefConfig = {
            ...envConfig,
            rootDir,
            dryRun: options.dryRun || envConfig.dryRun,
            maxRunSeconds: options.maxTime ? parseInt(options.maxTime) : envConfig.maxRunSeconds,
            maxTokensPerRun: options.maxTokens ? parseInt(options.maxTokens) : envConfig.maxTokensPerRun,
            maxCoderTurns: options.maxCoderTurns ? parseInt(options.maxCoderTurns) : envConfig.maxCoderTurns
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

            // Initialize git if enabled
            const gitEnabled = !options.nogit && cfg.gitEnabled;
            const gitInitialized = await ensureGitRepo(rootDir, {
                enabled: gitEnabled,
                autoInit: cfg.gitAutoInit,
                dryRun: cfg.dryRun,
                gitBinary: cfg.gitBinary,
                logger: log
            });
            log.info('Git initialization status', { gitEnabled, gitInitialized });

            // Load SDD artifacts
            log.info('Loading SDD artifacts...');
            const projectMd = await fs.readFile(path.join(sddDir, 'project.md'), 'utf-8').catch(() => '');
            const architectMd = await fs.readFile(path.join(sddDir, 'architect.md'), 'utf-8').catch(() => '');
            const bestPracticesMd = await fs.readFile(path.join(sddDir, 'best_practices.md'), 'utf-8').catch(() => '');

            let ticketContent = '';
            let ticketFileName: string | undefined;
            let ticketPath: string | undefined;
            let ticketId: string | undefined;
            if (options.ticket) {
                // Try to find ticket file
                // This is a simplification, ideally we search for matching ID
                const ticketsDir = path.join(sddDir, 'backlog/tickets/open');
                const files = await fs.readdir(ticketsDir).catch(() => []);
                const ticketFile = files.find(f => f.startsWith(options.ticket));
                if (ticketFile) {
                    ticketFileName = ticketFile;
                    ticketPath = path.join(ticketsDir, ticketFile);
                    ticketContent = await fs.readFile(ticketPath, 'utf-8');
                    // Extract ticketId from filename (remove .md extension)
                    ticketId = ticketFile.replace(/\.md$/, '');
                } else {
                    log.warn(`Ticket ${options.ticket} not found.`);
                }
            }

            // Initialize State
            const taskScope = estimateTaskScope(options.goal, ticketContent, architectMd);

            // Ticket Requirement Check (Ticket 46)
            // If scope is not tiny, and we are in an SDD project, and no ticket is provided/found...
            if (sddExists && taskScope !== 'tiny' && !options.ticket) {
                // Check if any open tickets exist
                const ticketsDir = path.join(sddDir, 'backlog/tickets/open');
                const openTickets = await fs.readdir(ticketsDir).catch(() => []).then(files => files.filter(f => f.endsWith('.md')));

                if (openTickets.length === 0) {
                    log.info('Medium/Large task requires tickets. Auto-generating...', { taskScope, goal: options.goal });
                    console_log.warning('Medium/Large task detected with no tickets');
                    console_log.info('Auto-generating tickets via SDD Orchestrator...');

                    try {
                        await runSddOrchestration(cfg, rootDir, options.goal);

                        // Re-scan for tickets
                        const newTickets = await fs.readdir(ticketsDir).catch(() => []).then(files => files.filter(f => f.endsWith('.md')));
                        if (newTickets.length === 0) {
                            throw new Error('Orchestrator finished but no tickets were found.');
                        }
                        console_log.success(`Generated ${newTickets.length} tickets`);
                        console_log.info('Proceeding with execution...');
                    } catch (err) {
                        log.error('Failed to auto-generate tickets', { error: (err as Error).message });
                        console.error(chalk.red('\n❌ Error: Failed to auto-generate tickets.'));
                        console.error(chalk.white(`   Details: ${(err as Error).message}`));
                        process.exit(1);
                    }
                }
            }

            // Build SDD summaries for token optimization (cached to disk)
            log.info('Building SDD summaries...');
            const sddSummaries = await buildSddSummaries(cfg, rootDir);

            const initialState: Partial<AgentState> = {
                messages: options.goal ? [{ role: 'user', content: options.goal }] : [],
                sdd: {
                    goal: options.goal,
                    project: projectMd,
                    architect: architectMd,
                    bestPractices: bestPracticesMd,
                    ticket: ticketContent,
                    ticketPath
                },
                hasSdd: true,
                // In YOLO mode we bias the planner/coder towards the most aggressive profile.
                runProfile: options.profile || (options.yolo ? 'yolo' : undefined),
                taskScope,
                sddSummaries, // Add summaries to state
                fileChanges: {},
                testResults: {},
                researchResults: []
            };

            // Run Graph
            log.info('Building and running agent graph...');
            const graph = buildKotefGraph(cfg);
            const result = await graph.invoke(initialState, { recursionLimit: 100 });

            log.info('Run completed.', { done: result.done });

            // Ticket 50: Persist ADRs and Assumptions
            const typedResult = result as unknown as AgentState;
            if (typedResult.designDecisions && typedResult.designDecisions.length > 0) {
                for (const decision of typedResult.designDecisions) {
                    await appendAdr(sddDir, decision, log);
                }
            }
            if (typedResult.assumptions && typedResult.assumptions.length > 0) {
                await syncAssumptions(sddDir, typedResult.assumptions, log);
            }

            // Attempt commit if ticket completed successfully
            let commitHash: string | undefined;
            if (result.done && ticketContent) {
                const filesChanged = Object.keys(result.fileChanges || {});
                const ticketTitle = extractTicketTitle(ticketContent);

                const commitResult = await commitTicketRun(rootDir, {
                    enabled: gitEnabled,
                    dryRun: cfg.dryRun,
                    ticketId,
                    ticketTitle,
                    filesChanged,
                    gitBinary: cfg.gitBinary,
                    logger: log
                });

                if (commitResult.committed && commitResult.hash) {
                    commitHash = commitResult.hash;
                    console.log(chalk.green(`✓ Changes committed: ${commitResult.hash.substring(0, 7)}`));
                } else if (commitResult.reason) {
                    log.info('Commit skipped', { reason: commitResult.reason });
                }
            } else if (result.done && !ticketContent) {
                log.info('No ticket content available for commit message');
            } else {
                log.info('Ticket not done, skipping commit');
            }

            // Auto-continue to next ticket if current one is done
            if (result.done) {
                const nextTicket = await findNextTicket(rootDir);
                if (nextTicket) {
                    console.log(chalk.green(`\n✓ Ticket ${ticketId} completed!`));
                    console.log(chalk.cyan(`→ Next ticket available: ${nextTicket.id}`));

                    let shouldContinue = options.continue || options.autoApprove;

                    if (!shouldContinue) {
                        const rl = readline.createInterface({ input, output });
                        const answer = await rl.question(chalk.yellow('Continue to next ticket? (y/N): '));
                        rl.close();
                        shouldContinue = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
                    }

                    if (shouldContinue) {
                        console.log(chalk.green(`\n▶ Starting ticket ${nextTicket.id}...\n`));
                        // Recursively call with next ticket
                        await program.parseAsync([
                            process.argv[0],
                            process.argv[1],
                            'run',
                            '--root', rootDir,
                            '--ticket', nextTicket.id,
                            ...(options.continue ? ['--continue'] : []),
                            ...(options.autoApprove ? ['--auto-approve'] : []),
                            ...(options.dryRun ? ['--dry-run'] : []),
                            ...(options.nogit ? ['--nogit'] : []),
                            ...(options.profile ? ['--profile', options.profile] : [])
                        ]);
                        return; // Exit current run
                    }
                }
            }

            // Generate Report
            const endTime = Date.now();
            const durationSeconds = (endTime - startTime) / 1000;

            // Calculate metrics from state
            const messages = (result.messages || []) as any[];
            const llmCalls = messages.filter(m => m.role === 'assistant').length;
            const toolCalls = messages.filter(m => m.role === 'tool').length; // Approximation, or count tool_calls in assistant messages
            // Better tool call count:
            const actualToolCalls = messages.reduce((acc, m) => {
                if (m.role === 'assistant' && m.tool_calls) {
                    return acc + m.tool_calls.length;
                }
                return acc;
            }, 0);

            // Infer final ticket status from path
            let ticketStatus: 'open' | 'closed' | undefined;
            const finalTicketPath = (result.sdd as any)?.ticketPath || ticketPath;
            if (finalTicketPath) {
                ticketStatus = finalTicketPath.includes('/closed/') ? 'closed' : 'open';

                // Conservative warning: if done but ticket still open
                if (result.done && ticketStatus === 'open') {
                    log.warn('Ticket marked done but still in open/', { ticketId, ticketPath: finalTicketPath });
                    console.warn(chalk.yellow(`⚠️  Warning: Ticket marked done but still in open/ (ticket_closer may have failed)`));
                }
            }

            const summary: RunSummary = {
                status: result.done ? 'success' : 'partial',
                plan: result.plan ? JSON.stringify(result.plan, null, 2) : 'No plan',
                filesChanged: Object.keys(result.fileChanges || {}),
                tests: JSON.stringify(result.testResults || {}, null, 2),
                issues: (result.sdd as any)?.issues,
                durationSeconds,
                metrics: {
                    llmCalls,
                    toolCalls: actualToolCalls,
                    totalTokens: 0 // We don't track tokens yet
                },
                terminalStatus: result.terminalStatus as any,
                stopReason: (result.plan as any)?.reason as string,
                // Ticket lifecycle metadata
                ticketId,
                ticketPath: finalTicketPath,
                ticketStatus,
                // Git commit hash
                commitHash,
                // Ticket 53: Flow Metrics
                flowMetrics: computeFlowMetrics(result as unknown as AgentState, startTime, endTime)
            };

            await writeRunReport(sddDir, runId, summary, result as unknown as AgentState);

        } catch (error: any) {
            log.error('Run failed', { error: error.message, stack: error.stack });
            console.error(chalk.red(`Fatal error: ${(error as any).message}`));

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



program
    .command('chat')
    .description('Interactive coding session (Voyant-style, Navan-like CLI)')
    .option('--root <path>', 'Project root directory', process.cwd())
    .option('--goal <text>', 'Initial goal')
    .option('--max-coder-turns <count>', 'Hard cap on coder tool-loop turns')
    .option('--yolo', 'Aggressive mode: minimal guardrails, more tool turns', false)
    .option('--auto-approve', 'Skip interactive approval', false)
    .option('--nogit', 'Disable git integration', false)
    .action(async (options) => {
        const rootDir = path.resolve(expandTilde(options.root));
        const envConfig = loadConfig();
        const cfg: KotefConfig = {
            ...envConfig,
            rootDir,
            maxCoderTurns: options.maxCoderTurns ? parseInt(options.maxCoderTurns) : envConfig.maxCoderTurns
        };

        const rl = readline.createInterface({ input, output });

        console.log(
            chalk.cyan(`
  ▗▖ ▗▖ ▗▄▖▗▄▄▄▖▗▄▄▄▖▗▄▄▄▖
  ▐▌▗▞▘▐▌ ▐▌ █  ▐▌   ▐▌   
  ▐▛▚▖ ▐▌ ▐▌ █  ▐▛▀▀▘▐▛▀▀▘
  ▐▌ ▐▌▝▚▄▞▘ █  ▐▙▄▄▖▐▌   
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

        // Initialize git once at session start
        const log = createLogger('chat-session');
        const gitEnabled = !options.nogit && cfg.gitEnabled;
        const gitInitialized = await ensureGitRepo(rootDir, {
            enabled: gitEnabled,
            autoInit: cfg.gitAutoInit,
            dryRun: cfg.dryRun,
            gitBinary: cfg.gitBinary,
            logger: log
        });
        if (gitInitialized) {
            console.log(chalk.gray('✓ Git repository ready\n'));
        } else if (!gitEnabled) {
            console.log(chalk.gray('ℹ Git integration disabled\n'));
        }

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

            // Create spinner for orchestration
            const spinner = new Spinner();
            let pipelineOpen = false;

            // Orchestrate SDD (research → architect → tickets)
            console.log(PIPELINE_TOP);
            pipelineOpen = true;
            spinner.start();
            spinner.setStatus('Running SDD bootstrap/orchestration...');

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
                    spinner.setStage('research');
                    spinner.setStatus('Bootstrapping project from goal...');
                    await bootstrapSddForProject(cfg, rootDir, goal);
                } else {
                    spinner.setStage('plan');
                    spinner.setStatus('Updating SDD artifacts...');
                    await runSddOrchestration(cfg, rootDir, goal);
                }

                spinner.stop();
                if (pipelineOpen) {
                    console.log(PIPELINE_BOTTOM);
                    pipelineOpen = false;
                }
            } catch (e: any) {
                spinner.stop();
                if (pipelineOpen) {
                    console.log(PIPELINE_BOTTOM);
                    pipelineOpen = false;
                }
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

            const proceed = options.autoApprove ? 'y' : (
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

                // Create spinner for ticket execution
                const ticketSpinner = new Spinner();
                let ticketPipelineOpen = false;

                try {
                    const sddDir = path.join(rootDir, '.sdd');
                    const projectMd = await fs.readFile(path.join(sddDir, 'project.md'), 'utf-8').catch(() => '');
                    const architectMd = await fs.readFile(path.join(sddDir, 'architect.md'), 'utf-8').catch(() => '');
                    const bestPracticesMd = await fs.readFile(path.join(sddDir, 'best_practices.md'), 'utf-8').catch(() => '');
                    const ticketPath = path.join(ticketsDir, ticket);
                    const ticketContent = await fs.readFile(ticketPath, 'utf-8');
                    // Extract ticketId from filename
                    const ticketId = ticket.replace(/\.md$/, '');

                    const taskScope = estimateTaskScope(`Execute ticket: ${ticket}`, ticketContent, architectMd);
                    const initialState: Partial<AgentState> = {
                        messages: [{ role: 'user', content: `Execute ticket: ${ticket}` }],
                        sdd: {
                            goal: `Execute ticket: ${ticket}`,
                            project: projectMd,
                            architect: architectMd,
                            bestPractices: bestPracticesMd,
                            ticket: ticketContent,
                            ticketPath
                        },
                        hasSdd: true,
                        runProfile: options.yolo ? 'yolo' : undefined,
                        taskScope,
                        fileChanges: {},
                        testResults: {},
                        researchResults: []
                    };

                    console.log(PIPELINE_TOP);
                    ticketPipelineOpen = true;
                    ticketSpinner.start();
                    ticketSpinner.setStage('research');
                    ticketSpinner.setStatus('Analyzing ticket requirements...');

                    const graph = buildKotefGraph(cfg);

                    ticketSpinner.setStage('plan');
                    ticketSpinner.setStatus('Creating execution plan...');

                    ticketSpinner.setStage('code');
                    ticketSpinner.setStatus('Writing code changes...');

                    const result = await graph.invoke(initialState, { recursionLimit: 100 });

                    ticketSpinner.setStage('verify');
                    ticketSpinner.setStatus('Running verification...');

                    ticketSpinner.setStage('finalize');
                    ticketSpinner.setStatus('Finalizing changes...');

                    ticketSpinner.stop();
                    if (ticketPipelineOpen) {
                        console.log(PIPELINE_BOTTOM);
                        ticketPipelineOpen = false;
                    }

                    // Ticket 50: Persist ADRs and Assumptions
                    const typedResult = result as unknown as AgentState;
                    if (typedResult.designDecisions && typedResult.designDecisions.length > 0) {
                        for (const decision of typedResult.designDecisions) {
                            await appendAdr(sddDir, decision, log);
                        }
                    }
                    if (typedResult.assumptions && typedResult.assumptions.length > 0) {
                        await syncAssumptions(sddDir, typedResult.assumptions, log);
                    }

                    const endTime = Date.now();
                    const durationSeconds = (endTime - startTime) / 1000;

                    // Attempt commit if ticket completed successfully
                    let commitHash: string | undefined;
                    if (result.done && ticketContent) {
                        const filesChanged = Object.keys(result.fileChanges || {});
                        const ticketTitle = extractTicketTitle(ticketContent);

                        const commitResult = await commitTicketRun(rootDir, {
                            enabled: gitEnabled,
                            dryRun: cfg.dryRun,
                            ticketId,
                            ticketTitle,
                            filesChanged,
                            gitBinary: cfg.gitBinary,
                            logger: log
                        });

                        if (commitResult.committed && commitResult.hash) {
                            commitHash = commitResult.hash;
                            console.log(chalk.green(`  ✓ Committed: ${commitResult.hash.substring(0, 7)}`));
                        } else if (commitResult.reason) {
                            log.info('Commit skipped', { reason: commitResult.reason, ticketId });
                        }
                    }

                    // Infer final ticket status from path
                    let ticketStatus: 'open' | 'closed' | undefined;
                    const finalTicketPath = (result.sdd as any)?.ticketPath || ticketPath;
                    if (finalTicketPath) {
                        ticketStatus = finalTicketPath.includes('/closed/') ? 'closed' : 'open';

                        // Conservative warning: if done but ticket still open
                        if (result.done && ticketStatus === 'open') {
                            log.warn('Ticket marked done but still in open/', { ticketId, ticketPath: finalTicketPath });
                            console.warn(chalk.yellow(`⚠️  Warning: Ticket marked done but still in open/ (ticket_closer may have failed)`));
                        }
                    }

                    const summary: RunSummary = {
                        status: result.done ? 'success' : 'partial',
                        plan: result.plan ? JSON.stringify(result.plan, null, 2) : 'No plan',
                        filesChanged: Object.keys(result.fileChanges || {}),
                        tests: JSON.stringify(result.testResults || {}, null, 2),
                        issues: (result.sdd as any)?.issues,
                        durationSeconds,
                        terminalStatus: result.terminalStatus as any,
                        stopReason: (result.plan as any)?.reason as string,
                        // Ticket lifecycle metadata
                        ticketId,
                        ticketPath: finalTicketPath,
                        ticketStatus,
                        // Git commit hash
                        commitHash,
                        // Ticket 53: Flow Metrics
                        flowMetrics: computeFlowMetrics(result as unknown as AgentState, startTime, endTime)
                    };

                    await writeRunReport(sddDir, runId, summary, result as unknown as AgentState);

                    const reportText = `**Status:** ${summary.status}\n` +
                        `**Files changed:** ${summary.filesChanged.join(', ') || 'none'}\n` +
                        `**Duration:** ${durationSeconds.toFixed(2)}s`;

                    const assistantBlock = createBlock(
                        'Kotef',
                        renderMarkdownToTerminal(reportText),
                        chalk.greenBright,
                        identity
                    );
                    console.log();
                    console.log(assistantBlock.top);
                    if (assistantBlock.body.length > 0) {
                        await streamText(`${assistantBlock.body}\n`);
                    }
                    console.log(assistantBlock.bottom);

                    if (result.done) {
                        console.log(chalk.green(`✅ Ticket ${ticket} completed.`));
                        // Ticket closing (move open → closed) is handled by the agent's ticket_closer node.
                    } else {
                        console.log(chalk.yellow(`⚠️  Ticket ${ticket} finished with partial/blocked status.`));
                    }
                } catch (e: any) {
                    ticketSpinner.stop();
                    if (ticketPipelineOpen) {
                        console.log(PIPELINE_BOTTOM);
                        ticketPipelineOpen = false;
                    }
                    log.error('Ticket execution failed', { ticket, error: e?.message });
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    console.error(chalk.red(`Error: Failed to execute ticket ${ticket}: ${(e as any).message}`));
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
