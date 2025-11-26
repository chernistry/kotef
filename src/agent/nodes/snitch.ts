import path from 'node:path';
import { promises as fs } from 'node:fs';

import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { loadRuntimePrompt } from '../../core/prompts.js';
import { callChat } from '../../core/llm.js';
import { deriveRiskEntries, appendRiskEntries, createTechDebtTicket } from '../utils/risk.js';

export function snitchNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('snitch');
        log.info('Snitch node started');

        const sddRoot = path.join(cfg.rootDir, '.sdd');

        // 1. Generate Issues Log
        const prompt = await loadRuntimePrompt('snitch', {
            GOAL: state.sdd.goal || 'Unknown goal',
            MESSAGES: JSON.stringify(state.messages.slice(-10)), // Last 10 messages for context
            FAILURE_HISTORY: JSON.stringify(state.failureHistory || []),
            TERMINAL_STATUS: state.terminalStatus || 'unknown',
            BUDGET_STATE: JSON.stringify(state.budget || {})
        });

        const response = await callChat({
            model: cfg.modelFast,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        });

        const issueContent = response.messages[0].content;
        const issuesFile = path.join(sddRoot, 'issues.md');

        // Append to issues.md
        const timestamp = new Date().toISOString();
        const entry = `\n## Run ${timestamp}\n**Status**: ${state.terminalStatus}\n\n${issueContent}\n`;

        try {
            await fs.mkdir(sddRoot, { recursive: true });
            await fs.appendFile(issuesFile, entry, 'utf-8');
            log.info(`Appended run issues to ${issuesFile}`);
        } catch (e) {
            // Try creating if doesn't exist
            await fs.writeFile(issuesFile, `# Issues Log\n${entry}`, 'utf-8');
        }

        // 2. Risk Register & Tech Debt (Ticket 51)
        const newRisks = deriveRiskEntries(state);
        if (newRisks.length > 0) {
            log.info(`Derived ${newRisks.length} new risks.`);
            await appendRiskEntries(sddRoot, newRisks);

            // Auto-create tickets for High severity risks
            for (const risk of newRisks) {
                if (risk.severity === 'high') {
                    const ticketPath = await createTechDebtTicket(sddRoot, risk);
                    if (ticketPath) {
                        log.info(`Created tech debt ticket for high severity risk: ${risk.id}`);
                    }
                }
            }
        }

        const reason = (state.plan as any)?.reason || 'Blocked due to SDD conflict or missing information.';
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
