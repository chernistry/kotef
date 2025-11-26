import { AgentState, TerminalStatus } from '../state.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface FlowMetrics {
    // DORA-like proxies
    changeSize: number; // Number of files changed
    diagnosticLatencySeconds: number; // Time to first verification run
    verificationRuns: number;
    failureMode: string; // 'none', 'tests_failed', 'build_failed', 'budget_exhausted', 'stuck_loop', 'research_insufficient'

    // Resource usage
    commandsUsed: number;
    testRunsUsed: number;
    webRequestsUsed: number;

    // Outcome
    status: 'success' | 'partial' | 'failed';
    durationSeconds: number;
}

export interface AggregatedMetrics {
    totalRuns: number;
    successRate: number;
    averageDurationSeconds: number;
    averageChangeSize: number;
    averageCommandsUsed: number;
    failureModes: Record<string, number>;
    recentTrend: 'stable' | 'improving' | 'degrading';
}

export function computeFlowMetrics(state: AgentState, startTime: number, endTime: number): FlowMetrics {
    const durationSeconds = (endTime - startTime) / 1000;

    // Change size
    const filesChanged = state.fileChanges ? Object.keys(state.fileChanges).length : 0;

    // Resource usage
    const commandsUsed = state.budget?.commandsUsed || 0;
    const testRunsUsed = state.budget?.testRunsUsed || 0;
    const webRequestsUsed = state.budget?.webRequestsUsed || 0;

    // Verification runs
    const verificationRuns = state.functionalChecks ? state.functionalChecks.filter(c => c.node === 'verifier').length : 0;

    // Diagnostic latency (time to first check)
    let diagnosticLatencySeconds = 0;
    if (state.functionalChecks && state.functionalChecks.length > 0) {
        const firstCheck = state.functionalChecks[0].timestamp;
        diagnosticLatencySeconds = (firstCheck - startTime) / 1000;
    }

    // Failure mode & Status
    let failureMode = 'none';
    let status: 'success' | 'partial' | 'failed' = 'success';

    if (state.terminalStatus === 'done_success') {
        status = 'success';
    } else if (state.terminalStatus === 'done_partial') {
        status = 'partial';
        failureMode = 'partial_completion';
    } else {
        status = 'failed';
        if (state.terminalStatus === 'aborted_stuck') {
            failureMode = 'stuck_loop';
        } else if (state.terminalStatus === 'aborted_constraint') {
            failureMode = 'constraint_violation';
        } else {
            failureMode = 'unknown_failure';
        }

        // Refine failure mode based on diagnostics
        if (state.diagnosticsLog && state.diagnosticsLog.length > 0) {
            const lastDiag = state.diagnosticsLog[state.diagnosticsLog.length - 1];
            if (lastDiag.source === 'test') failureMode = 'tests_failed';
            else if (lastDiag.source === 'build') failureMode = 'build_failed';
            else if (lastDiag.source === 'lint') failureMode = 'lint_failed';
        }

        // Check budget exhaustion
        if (state.budget && (
            state.budget.commandsUsed >= state.budget.maxCommands ||
            state.budget.testRunsUsed >= state.budget.maxTestRuns ||
            state.budget.webRequestsUsed >= state.budget.maxWebRequests
        )) {
            failureMode = 'budget_exhausted';
        }
    }

    return {
        changeSize: filesChanged,
        diagnosticLatencySeconds,
        verificationRuns,
        failureMode,
        commandsUsed,
        testRunsUsed,
        webRequestsUsed,
        status,
        durationSeconds
    };
}

export async function aggregateMetrics(runsDir: string): Promise<AggregatedMetrics> {
    let files: string[] = [];
    try {
        files = await fs.readdir(runsDir);
    } catch (e) {
        return createEmptyAggregatedMetrics();
    }

    const reports = files.filter(f => f.endsWith('.md'));
    const metricsList: FlowMetrics[] = [];

    // Limit to recent 50 runs to keep it fast and relevant
    const recentReports = reports.sort().reverse().slice(0, 50);

    for (const file of recentReports) {
        try {
            const content = await fs.readFile(path.join(runsDir, file), 'utf-8');
            const metrics = extractMetricsFromReport(content);
            if (metrics) {
                metricsList.push(metrics);
            }
        } catch (e) {
            // Ignore malformed reports
        }
    }

    if (metricsList.length === 0) {
        return createEmptyAggregatedMetrics();
    }

    const totalRuns = metricsList.length;
    const successCount = metricsList.filter(m => m.status === 'success').length;
    const successRate = successCount / totalRuns;

    const totalDuration = metricsList.reduce((sum, m) => sum + m.durationSeconds, 0);
    const totalChangeSize = metricsList.reduce((sum, m) => sum + m.changeSize, 0);
    const totalCommands = metricsList.reduce((sum, m) => sum + m.commandsUsed, 0);

    const failureModes: Record<string, number> = {};
    metricsList.forEach(m => {
        if (m.status !== 'success') {
            failureModes[m.failureMode] = (failureModes[m.failureMode] || 0) + 1;
        }
    });

    // Simple trend analysis (compare first half vs second half of the window)
    let recentTrend: 'stable' | 'improving' | 'degrading' = 'stable';
    if (metricsList.length >= 10) {
        const mid = Math.floor(metricsList.length / 2);
        // metricsList is reversed (newest first). So first half is NEWER.
        const newer = metricsList.slice(0, mid);
        const older = metricsList.slice(mid);

        const newerSuccess = newer.filter(m => m.status === 'success').length / newer.length;
        const olderSuccess = older.filter(m => m.status === 'success').length / older.length;

        if (newerSuccess > olderSuccess + 0.1) recentTrend = 'improving';
        else if (newerSuccess < olderSuccess - 0.1) recentTrend = 'degrading';
    }

    return {
        totalRuns,
        successRate,
        averageDurationSeconds: totalDuration / totalRuns,
        averageChangeSize: totalChangeSize / totalRuns,
        averageCommandsUsed: totalCommands / totalRuns,
        failureModes,
        recentTrend
    };
}

export async function saveAggregatedMetrics(cacheDir: string, metrics: AggregatedMetrics): Promise<void> {
    const filepath = path.join(cacheDir, 'flow_metrics.json');
    await fs.writeFile(filepath, JSON.stringify(metrics, null, 2), 'utf-8');
}

function createEmptyAggregatedMetrics(): AggregatedMetrics {
    return {
        totalRuns: 0,
        successRate: 0,
        averageDurationSeconds: 0,
        averageChangeSize: 0,
        averageCommandsUsed: 0,
        failureModes: {},
        recentTrend: 'stable'
    };
}

// Helper to parse metrics back from markdown report (rudimentary)
// In a real system, we might store a sidecar JSON. For now, regex scraping.
function extractMetricsFromReport(content: string): FlowMetrics | null {
    // This is brittle but sufficient for the "proxy" requirement without a DB.
    // We look for the "## Metrics" section and "## Status" section.

    // If the report doesn't have the new metrics format yet, return null
    if (!content.includes('## Metrics')) return null;

    try {
        // Try to match the new compact format first
        const resourceMatch = content.match(/- \*\*Resource Usage:\*\* (\d+) cmds, (\d+) tests, (\d+) web/);

        let commandsUsed = 0;
        let testRunsUsed = 0;
        let webRequestsUsed = 0;

        if (resourceMatch) {
            commandsUsed = parseInt(resourceMatch[1]);
            testRunsUsed = parseInt(resourceMatch[2]);
            webRequestsUsed = parseInt(resourceMatch[3]);
        } else {
            // Fallback to old format if present (legacy reports)
            const commandsMatch = content.match(/- \*\*Commands\*\*: (\d+)/);
            const testRunsMatch = content.match(/- \*\*Test Runs\*\*: (\d+)/);
            const webRequestsMatch = content.match(/- \*\*Web Requests\*\*: (\d+)/);

            if (commandsMatch) commandsUsed = parseInt(commandsMatch[1]);
            if (testRunsMatch) testRunsUsed = parseInt(testRunsMatch[1]);
            if (webRequestsMatch) webRequestsUsed = parseInt(webRequestsMatch[1]);
        }

        const durationMatch = content.match(/\*\*Duration:\*\* ([\d.]+)s/);
        const statusMatch = content.match(/\*\*Status:\*\* (\w+)/);
        const changeSizeMatch = content.match(/- \*\*Change Size:\*\* (\d+) files/);
        const failureModeMatch = content.match(/- \*\*Failure Mode:\*\* (\w+)/);

        // We might not be able to reconstruct everything perfectly from text,
        // but we can get the basics for aggregation.

        return {
            changeSize: changeSizeMatch ? parseInt(changeSizeMatch[1]) : 0,
            diagnosticLatencySeconds: 0,
            verificationRuns: 0,
            failureMode: failureModeMatch ? failureModeMatch[1] : 'unknown',
            commandsUsed,
            testRunsUsed,
            webRequestsUsed,
            status: (statusMatch ? statusMatch[1] : 'failed') as any,
            durationSeconds: durationMatch ? parseFloat(durationMatch[1]) : 0
        };
    } catch (e) {
        return null;
    }
}
