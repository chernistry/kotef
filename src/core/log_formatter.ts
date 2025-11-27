import { console_log } from './console.js';

/**
 * Intercepts structured logs and outputs pretty console messages
 */
export function formatLogForConsole(logEntry: any): void {
    const { level, message, runId } = logEntry;

    // Skip verbose logs
    if (runId === 'project-summary' || runId === 'tavily') return;

    // Map important messages to pretty output
    if (message === 'Starting kotef run') {
        console_log.header('KOTEF RUN STARTED');
        if (logEntry.goal) {
            console_log.info('Goal:', logEntry.goal.slice(0, 100) + (logEntry.goal.length > 100 ? '...' : ''));
        }
        if (logEntry.ticket) {
            console_log.ticket(`Working on ticket: ${logEntry.ticket}`);
        }
        return;
    }

    if (message === 'Planner node started') {
        console_log.section('Planning');
        return;
    }

    if (message === 'Planner decision') {
        const { next, reason, profile } = logEntry;
        console_log.info(`Next: ${next}`, `[${profile}]`);
        console_log.dim(reason.slice(0, 120) + (reason.length > 120 ? '...' : ''));
        return;
    }

    if (message === 'Researcher node started') {
        console_log.section('Research');
        return;
    }

    if (message === 'Starting deep research') {
        console_log.research('Deep research started');
        return;
    }

    if (message === 'Research quality met thresholds') {
        const { quality } = logEntry;
        console_log.success(`Research complete`, `relevance=${quality.relevance.toFixed(2)}`);
        return;
    }

    if (message === 'Kiro coder node started') {
        console_log.section('Coding');
        return;
    }

    if (message === 'Kiro CLI session completed') {
        const { changedFiles } = logEntry;
        console_log.success(`Modified ${changedFiles} file(s)`);
        return;
    }

    if (message === 'Verifier node started') {
        console_log.section('Verification');
        return;
    }

    if (message === 'Running verification command') {
        // Skip - too verbose
        return;
    }

    if (message.includes('test') && level === 'info') {
        console_log.test(message);
        return;
    }

    if (message === 'Run completed.') {
        console_log.divider();
        if (logEntry.done) {
            console_log.success('Run completed successfully');
        } else {
            console_log.warning('Run completed (partial)');
        }
        return;
    }

    // Errors
    if (level === 'error' && !message.includes('LSP server')) {
        console_log.error(message);
    }

    // Warnings
    if (level === 'warn') {
        console_log.warning(message);
    }
}
