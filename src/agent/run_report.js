import path from 'node:path';
import { promises as fs } from 'node:fs';
export async function writeRunReport(sddRoot, runId, summary, state) {
    const runsDir = path.join(sddRoot, 'runs');
    // Ensure runs directory exists
    try {
        await fs.mkdir(runsDir, { recursive: true });
    }
    catch (e) {
        // Ignore if exists
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${runId}.md`;
    const filepath = path.join(runsDir, filename);
    let report = `# Run Report: ${runId}\n\n`;
    report += `**Date:** ${new Date().toISOString()}\n`;
    report += `**Status:** ${summary.status}\n`;
    if (summary.error) {
        report += `**Error:** ${summary.error}\n`;
    }
    report += `\n## Plan\n${summary.plan || 'No plan generated.'}\n`;
    report += `\n## Files Changed\n`;
    if (summary.filesChanged.length > 0) {
        summary.filesChanged.forEach(f => report += `- ${f}\n`);
    }
    else {
        report += `No files changed.\n`;
    }
    report += `\n## Verification\n${summary.tests || 'No verification results.'}\n`;
    if (summary.issues) {
        report += `\n## Issues Encountered\n${summary.issues}\n`;
    }
    if (state) {
        report += `\n## Research Findings\n`;
        const results = state.researchResults;
        if (Array.isArray(results) && results.length > 0) {
            results.forEach((r) => {
                report += `### ${r.query}\n${r.summary}\n\n`;
            });
        }
        else {
            report += `No research performed.\n`;
        }
    }
    await fs.writeFile(filepath, report, 'utf-8');
    console.log(`Run report written to: ${filepath}`);
}
