import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AgentState, RiskEntry } from '../state.js';
import { createLogger } from '../../core/logger.js';

const log = createLogger('risk-utils');

/**
 * Derives risk entries from the current agent state.
 * Analyzes terminal status, failure history, and budget usage.
 */
export function deriveRiskEntries(state: AgentState): RiskEntry[] {
    const risks: RiskEntry[] = [];

    // 1. Check for repeated failures (Stuck Loop)
    if (state.sameErrorCount && state.sameErrorCount >= 3) {
        const lastError = state.failureHistory && state.failureHistory.length > 0
            ? state.failureHistory[state.failureHistory.length - 1].error
            : 'Unknown error';

        risks.push({
            id: '', // Will be assigned by appendRiskEntries
            area: 'Agent Logic',
            type: 'reliability',
            severity: 'high',
            status: 'open',
            description: 'Agent is stuck in a loop with repeated errors.',
            evidence: `Same error count reached ${state.sameErrorCount}. Last error: ${lastError.slice(0, 100)}...`,
            links: []
        });
    }

    // 2. Check for Budget Exhaustion
    if (state.terminalStatus === 'aborted_constraint' && state.budget && state.budget.commandsUsed >= state.budget.maxCommands) {
        risks.push({
            id: '', // Will be assigned by appendRiskEntries
            area: 'Efficiency',
            type: 'performance',
            severity: 'medium',
            status: 'open',
            description: 'Run exhausted its budget before completion.',
            evidence: `Total steps: ${state.totalSteps}. Budget metrics: ${JSON.stringify(state.budget)}`,
            links: []
        });
    }

    // 3. Check for Recurring Functional Check Failures
    if (state.functionalChecks) {
        const failingChecks = state.functionalChecks.filter(c => c.exitCode !== 0);
        // Group by command to find recurring ones
        const commandFailures = new Map<string, number>();
        failingChecks.forEach(c => {
            commandFailures.set(c.command, (commandFailures.get(c.command) || 0) + 1);
        });

        for (const [command, count] of commandFailures) {
            if (count >= 2) {
                risks.push({
                    id: '', // Will be assigned by appendRiskEntries
                    area: 'Verification',
                    type: 'reliability',
                    severity: 'medium',
                    status: 'open',
                    description: `Functional check '${command}' failed repeatedly.`,
                    evidence: `Failed ${count} times in this run.`,
                    links: []
                });
            }
        }
    }

    return risks;
}

/**
 * Appends risk entries to the risk register file.
 * Merges with existing entries to avoid duplicates (based on description/area).
 */
export async function appendRiskEntries(sddRoot: string, newEntries: RiskEntry[]): Promise<void> {
    if (newEntries.length === 0) return;

    const riskFile = path.join(sddRoot, 'risk_register.md');
    let content = '';

    try {
        content = await fs.readFile(riskFile, 'utf-8');
    } catch (e) {
        // Create header if missing
        content = '# Risk Register\n\n| ID | Area | Type | Severity | Status | Description | Evidence | Links |\n|---|---|---|---|---|---|---|---|\n';
    }

    // Parse existing IDs to find max ID
    const lines = content.split('\n');
    let maxId = 0;
    for (const line of lines) {
        const match = line.match(/\| R-(\d+) \|/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxId) maxId = num;
        }
    }

    let appendedCount = 0;
    for (const entry of newEntries) {
        // Simple duplicate check: if description matches an existing row
        // This is naive but prevents exact duplicates in the same run context
        // A better approach would be to check if an OPEN risk with same description exists
        const descriptionSnippet = entry.description.slice(0, 20);
        if (content.includes(descriptionSnippet)) {
            // Update evidence of existing risk? 
            // For now, we skip to avoid flooding. 
            // Ideally we would parse the table and update the "Evidence" column.
            continue;
        }

        const id = `R-${String(maxId + 1).padStart(3, '0')}`;
        maxId++;
        entry.id = id; // Assign ID to the entry object for later use (e.g. ticket creation)

        const row = `| ${id} | ${entry.area} | ${entry.type} | ${entry.severity} | ${entry.status} | ${entry.description.replace(/\|/g, '\\|')} | ${entry.evidence.replace(/\|/g, '\\|')} | ${entry.links?.join(', ') || ''} |`;
        content += `${row}\n`;
        appendedCount++;
    }

    if (appendedCount > 0) {
        await fs.writeFile(riskFile, content, 'utf-8');
        log.info(`Appended ${appendedCount} risks to ${riskFile}`);
    }
}

/**
 * Creates a Tech Debt ticket for a high-severity risk.
 */
export async function createTechDebtTicket(sddRoot: string, risk: RiskEntry): Promise<string | null> {
    if (risk.severity !== 'high') return null;
    if (!risk.id) return null; // Should have been assigned in appendRiskEntries

    const ticketsDir = path.join(sddRoot, 'backlog', 'tickets', 'open');
    await fs.mkdir(ticketsDir, { recursive: true });

    // Find next ticket ID (simplified, assumes numeric prefix)
    const files = await fs.readdir(ticketsDir);
    let maxTicketId = 0;
    for (const file of files) {
        const match = file.match(/^(\d+)-/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxTicketId) maxTicketId = num;
        }
    }
    const ticketId = maxTicketId + 1;

    const sanitizedDesc = risk.description.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const filename = `${ticketId}-tech-debt-${sanitizedDesc}.md`;
    const filepath = path.join(ticketsDir, filename);

    const content = `# Ticket: ${ticketId} Tech debt: ${risk.area} - ${risk.description}

## Context
Automatically created from High Severity Risk ${risk.id}.

## Objective & Definition of Done
Mitigate the risk described below.

**Risk Description**: ${risk.description}
**Evidence**: ${risk.evidence}

## Steps
1. Investigate the root cause of the risk.
2. Implement a fix or mitigation.
3. Update the Risk Register status to 'mitigated'.

## Risks & Edge Cases
- Ensure the fix doesn't introduce regressions.

## Dependencies
- Risk: ${risk.id}
`;

    await fs.writeFile(filepath, content, 'utf-8');
    log.info(`Created Tech Debt ticket: ${filepath}`);
    return filepath;
}
