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
        const promptTemplate = await loadRuntimePrompt('snitch');
        const prompt = promptTemplate
            .replace('{{GOAL}}', state.sdd.goal || 'Unknown goal')
            .replace('{{MESSAGES}}', JSON.stringify(state.messages.slice(-10)))
            .replace('{{FAILURE_HISTORY}}', JSON.stringify(state.failureHistory || []))
            .replace('{{TERMINAL_STATUS}}', state.terminalStatus || 'unknown')
            .replace('{{BUDGET_STATE}}', JSON.stringify(state.budget || {}));

        const response = await callChat(cfg, [{ role: 'user', content: prompt }], {
            model: cfg.modelFast,
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

        // 3. Blocklist tickets that are clearly stuck in loops to avoid re-selecting them blindly
        try {
            const terminalStatus = state.terminalStatus;
            const ticketPath = state.sdd?.ticketPath;
            const loopReason = reason || '';

            if (ticketPath && terminalStatus === 'aborted_stuck') {
                const ticketFile = path.basename(ticketPath);
                const match = ticketFile.match(/^(\d+)/);
                const ticketId = match?.[1];

                if (ticketId && /loop|stuck|Max steps limit reached/i.test(loopReason)) {
                    const cacheDir = path.join(sddRoot, 'cache');
                    const blockFile = path.join(cacheDir, 'blocked_tickets.json');

                    await fs.mkdir(cacheDir, { recursive: true });

                    let data: any = { ids: [], reasons: {} as Record<string, string[]> };
                    try {
                        const content = await fs.readFile(blockFile, 'utf-8');
                        const parsed = JSON.parse(content);
                        if (Array.isArray(parsed)) {
                            data.ids = parsed;
                        } else {
                            data = {
                                ids: Array.isArray(parsed.ids) ? parsed.ids : [],
                                reasons: parsed.reasons && typeof parsed.reasons === 'object' ? parsed.reasons : {}
                            };
                        }
                    } catch {
                        // Ignore missing/invalid file, start fresh
                    }

                    if (!data.ids.includes(ticketId)) {
                        data.ids.push(ticketId);
                    }
                    if (!data.reasons[ticketId]) {
                        data.reasons[ticketId] = [];
                    }
                    if (!data.reasons[ticketId].includes(loopReason)) {
                        data.reasons[ticketId].push(loopReason);
                    }

                    await fs.writeFile(blockFile, JSON.stringify(data, null, 2), 'utf-8');
                    log.info('Marked ticket as blocked due to stuck loop', { ticketId, reason: loopReason });
                }
            }
        } catch (e) {
            log.warn('Failed to update blocked tickets cache', { error: (e as Error).message });
        }

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
