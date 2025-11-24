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
    if (summary.durationSeconds) {
        report += `**Duration:** ${summary.durationSeconds.toFixed(2)}s\n`;
    }
    if (summary.tokenUsage) {
        report += `**Token Usage:** ${summary.tokenUsage}\n`;
    }
    if (summary.error) {
        report += `**Error:** ${summary.error}\n`;
    }
    report += `\n## Plan\n${summary.plan || 'No plan generated.'}\n`;

    report += `\n## Files Changed\n`;
    if (summary.filesChanged.length > 0) {
        summary.filesChanged.forEach(f => report += `- ${f}\n`);
    } else {
        report += `No files changed.\n`;
    }

    report += `\n## Verification\n${summary.tests || 'No verification results.'}\n`;

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
    }

    await fs.writeFile(filepath, report, 'utf-8');
    console.log(`Run report written to: ${filepath}`);
}
