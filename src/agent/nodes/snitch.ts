import path from 'node:path';
import { promises as fs } from 'node:fs';

import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

export function snitchNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('snitch');
        log.info('Snitch node started');

        const reason = (state.plan as any)?.reason || 'Blocked due to SDD conflict or missing information.';
        const goal = state.sdd.goal || '';
        const ticketSnippet = state.sdd.ticket
            ? state.sdd.ticket.split('\n')[0].slice(0, 120)
            : '';

        const sddRoot = path.join(cfg.rootDir, '.sdd');
        const issuesPath = path.join(sddRoot, 'issues.md');

        const timestamp = new Date().toISOString();
        const entryLines = [
            `## Snitch entry – ${timestamp}`,
            '',
            goal ? `**Goal:** ${goal}` : '',
            ticketSnippet ? `**Ticket:** ${ticketSnippet}` : '',
            '',
            `**Reason:** ${reason}`,
            ''
        ].filter(Boolean);

        if (state.metrics) {
            entryLines.push(`**Metrics at failure:** Tool Calls: ${state.metrics.toolCalls}, LLM Calls: ${state.metrics.llmCalls}`);
            entryLines.push('');
        }

        // Add failure history if present
        if (state.failureHistory && state.failureHistory.length > 0) {
            entryLines.push('**Failure History:**');
            entryLines.push('');
            state.failureHistory.forEach((failure, idx) => {
                const timeStr = new Date(failure.timestamp).toISOString();
                entryLines.push(`${idx + 1}. [${failure.step}] @ ${timeStr}: ${failure.error}`);
            });
            entryLines.push('');
        }

        entryLines.push('Source: planner decision with `next="snitch"`.');
        entryLines.push('');

        const entry = entryLines.join('\n') + '\n';

        try {
            await fs.mkdir(sddRoot, { recursive: true });
            try {
                await fs.access(issuesPath);
                await fs.appendFile(issuesPath, '\n' + entry, 'utf-8');
            } catch {
                await fs.writeFile(
                    issuesPath,
                    `# SDD Issues / Snitch Log\n\n${entry}`,
                    'utf-8'
                );
            }
            log.info('Snitch entry written to .sdd/issues.md');
        } catch (e: any) {
            log.warn('Failed to write snitch entry', { error: e?.message });
        }

        const existingIssues = state.sdd.issues || '';
        const combinedIssues = existingIssues
            ? `${existingIssues}\n\n${reason}`
            : reason;

        return {
            sdd: {
                ...state.sdd,
                issues: combinedIssues
            },
            // Do not mark as done=true: run should be treated as partial/blocked.
            done: false
        };
    };
}

