import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AgentState } from './state.js';

export interface RunSummary {
    plan: string;
    filesChanged: string[];
    tests: string;
    issues?: string;
    status: 'success' | 'failed' | 'partial';
    error?: string;
    durationSeconds?: number;
    tokenUsage?: number;
    metrics?: {
        toolCalls: number;
        llmCalls: number;
        totalTokens: number;
    };
    terminalStatus?: string;
    stopReason?: string;
    // Ticket lifecycle
    ticketId?: string;
    ticketPath?: string;
    ticketStatus?: 'open' | 'closed';
    followUpTickets?: string[];
    // Git commit
    commitHash?: string;
}

export async function writeRunReport(
    sddRoot: string,
    runId: string,
    summary: RunSummary,
    state?: AgentState
): Promise<void> {
    const runsDir = path.join(sddRoot, 'runs');

    // Ensure runs directory exists
    try {
        await fs.mkdir(runsDir, { recursive: true });
    } catch (e) {
        // Ignore if exists
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${runId}.md`;
    const filepath = path.join(runsDir, filename);

    let report = `# Run Report: ${runId}\n\n`;
    report += `**Date:** ${new Date().toISOString()}\n`;
    report += `**Status:** ${summary.status}\n`;
    if (summary.terminalStatus) {
        report += `**Terminal Status:** ${summary.terminalStatus}\n`;
    }
    if (summary.stopReason) {
        report += `**Stop Reason:** ${summary.stopReason}\n`;
    }
    if (summary.durationSeconds) {
        report += `**Duration:** ${summary.durationSeconds.toFixed(2)}s\n`;
    }
    if (summary.tokenUsage) {
        report += `**Token Usage:** ${summary.tokenUsage}\n`;
    }
    if (summary.error) {
        report += `**Error:** ${summary.error}\n`;
    }

    // Ticket information
    if (summary.ticketId || summary.ticketPath) {
        report += `\n## Ticket\n`;
        if (summary.ticketId) {
            report += `**Ticket ID:** ${summary.ticketId}\n`;
        }
        if (summary.ticketPath) {
            report += `**Ticket Path:** ${summary.ticketPath}\n`;
        }
        if (summary.ticketStatus) {
            report += `**Ticket Status:** ${summary.ticketStatus}\n`;
        }
        if (summary.commitHash) {
            report += `**Commit Hash:** \`${summary.commitHash}\`\n`;
        }
        if (summary.followUpTickets && summary.followUpTickets.length > 0) {
            report += `**Follow-Up Tickets Created:**\n`;
            summary.followUpTickets.forEach(t => report += `- ${t}\n`);
        }
    }

    if (summary.metrics) {
        report += `\n## Metrics\n`;
        report += `- **Tool Calls:** ${summary.metrics.toolCalls}\n`;
        report += `- **LLM Calls:** ${summary.metrics.llmCalls}\n`;
        report += `- **Total Tokens:** ${summary.metrics.totalTokens}\n`;
    }

    report += `\n## Plan\n${summary.plan || 'No plan generated.'}\n`;

    report += `\n## Files Changed\n`;
    if (summary.filesChanged.length > 0) {
        summary.filesChanged.forEach(f => report += `- ${f}\n`);
    } else {
        report += `No files changed.\n`;
    }

    if (state) {
        const verificationSection = state.detectedCommands ? `
## Verification Strategy
- **Stack**: ${state.detectedCommands.stack}
- **Profile**: ${state.runProfile || 'fast'}
- **Detected**:
  - Primary: \`${state.detectedCommands.primaryTest || 'none'}\`
  - Smoke: \`${state.detectedCommands.smokeTest || 'none'}\`
  - Build: \`${state.detectedCommands.buildCommand || 'none'}\`
` : '';

        let functionalProbesSection = '';
        if (state.functionalChecks && state.functionalChecks.length > 0) {
            functionalProbesSection = `\n## Functional Probes\n`;
            state.functionalChecks.forEach(check => {
                const icon = check.exitCode === 0 ? '✅' : '❌';
                functionalProbesSection += `- ${icon} \`${check.command}\` (exit ${check.exitCode})\n`;
                if (check.stderrSample) {
                    functionalProbesSection += `  - Stderr: \`${check.stderrSample.replace(/`/g, '')}\`\n`;
                }
            });
        }

        const testSection = state.testResults ? `
## Verification Results
- **Command**: \`${state.testResults.command}\`
- **Passed**: ${state.testResults.passed ? '✅' : '❌'}
- **Exit Code**: ${state.testResults.exitCode}
${state.testResults.stdout ? `\n\`\`\`\n${state.testResults.stdout.slice(0, 1000)}\n\`\`\`` : ''}
${state.testResults.stderr ? `\n**Stderr**:\n\`\`\`\n${state.testResults.stderr.slice(0, 1000)}\n\`\`\`` : ''}
` : '';

        const statusSection = `
## Status
- **Outcome**: ${state.terminalStatus || (state.done ? 'done_success' : 'in_progress')}
- **Steps**: ${state.totalSteps}
`;
        // The provided edit seems to be a template for a new report structure,
        // but the instruction is to "add Verification Strategy section".
        // I will integrate the new sections into the existing report generation flow.
        // The original `report += `\n## Verification\n${summary.tests || 'No verification results.'}\n`;`
        // will be replaced by the more detailed `verificationSection` and `testSection` if `state` is available.

        report += verificationSection;
        report += functionalProbesSection;
        report += testSection;

        // Diagnostics Timeline (Ticket 31)
        if (state.diagnosticsLog && state.diagnosticsLog.length > 0) {
            report += `\n## Diagnostics Timeline\n`;
            // Sort by occurrence count desc, then last seen
            const sorted = [...state.diagnosticsLog].sort((a, b) => b.occurrenceCount - a.occurrenceCount);
            const top = sorted.slice(0, 10);

            top.forEach(d => {
                const loc = d.file ? `${d.file}${d.location ? `:${d.location.line}` : ''}` : 'Global';
                report += `- **[${d.source.toUpperCase()}]** ${loc} (x${d.occurrenceCount})\n`;
                report += `  - Last seen: ${new Date(d.lastSeenAt).toISOString()}\n`;
                report += `  - Message: \`${d.message.replace(/`/g, '')}\`\n`;
            });

            if (sorted.length > 10) {
                report += `\n... and ${sorted.length - 10} more diagnostics.\n`;
            }
        }

        // Budget usage section (Ticket 19)
        if (state.budget) {
            report += `\n## Budget Usage\n`;
            report += `- **Commands**: ${state.budget.commandsUsed} / ${state.budget.maxCommands}\n`;
            report += `- **Test Runs**: ${state.budget.testRunsUsed} / ${state.budget.maxTestRuns}\n`;
            report += `- **Web Requests**: ${state.budget.webRequestsUsed} / ${state.budget.maxWebRequests}\n`;

            // Repeated commands analysis
            const commandCounts = new Map<string, number>();
            (state.budget.commandHistory || []).forEach(({ command }) => {
                commandCounts.set(command, (commandCounts.get(command) || 0) + 1);
            });

            const repeated = Array.from(commandCounts.entries())
                .filter(([_, count]) => count > 1)
                .sort(([_, a], [__, b]) => b - a)
                .slice(0, 5);

            if (repeated.length > 0) {
                report += `\n### Repeated Commands\n`;
                repeated.forEach(([cmd, count]) => {
                    report += `- \`${cmd}\`: ${count} times\n`;
                });
            }
        }

        // The statusSection is already partially covered by summary.terminalStatus,
        // and the overall status is at the top. I'll add the steps if state is present.
        if (state.totalSteps !== undefined) {
            report += `\n- **Total Steps**: ${state.totalSteps}\n`;
        }
    } else {
        report += `\n## Verification\n${summary.tests || 'No verification results.'}\n`;
    }


    if (summary.issues) {
        report += `\n## Issues Encountered\n${summary.issues}\n`;
    }

    if (state) {
        report += `\n## Research Findings\n`;
        const results = state.researchResults as any[];
        if (Array.isArray(results) && results.length > 0) {
            results.forEach((r: any) => {
                report += `### ${r.query}\n${r.summary}\n\n`;
            });
        } else {
            report += `No research performed.\n`;
        }

        // Ticket 50: ADRs and Assumptions
        if (state.designDecisions && state.designDecisions.length > 0) {
            report += `\n## Architectural Decisions (ADRs)\n`;
            state.designDecisions.forEach(d => {
                report += `- **${d.title}** (ID: ${d.id || 'pending'})\n`;
                report += `  - Decision: ${d.decision}\n`;
            });
        }

        if (state.assumptions && state.assumptions.length > 0) {
            report += `\n## Assumptions Log\n`;
            state.assumptions.forEach(a => {
                const icon = a.status === 'confirmed' ? '✅' : a.status === 'rejected' ? '❌' : '⚠️';
                report += `- ${icon} **[${a.status.toUpperCase()}]** ${a.statement} (Source: ${a.source})\n`;
            });
        }
    }

    await fs.writeFile(filepath, report, 'utf-8');
    console.log(`Run report written to: ${filepath}`);
}
