import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { ExecutionProfile, TaskScope } from '../../src/agent/state.js';

export interface EvalScenario {
    id: string;
    description: string;
    goal: string;
    profile: ExecutionProfile;
    scope: TaskScope;
    fixtureDir?: string;
    expectedStatus: string[];
    thresholds: {
        maxCommands?: number;
        maxTestRuns?: number;
        maxWebRequests?: number;
        maxSteps?: number;
    };
}

export interface EvalMetrics {
    steps: number;
    commandsUsed: number;
    testRunsUsed: number;
    webRequestsUsed: number;
    duration: number;
    terminalStatus: string;
}

export interface EvalResult {
    scenarioId: string;
    success: boolean;
    terminalStatus: string;
    metrics: EvalMetrics;
    violations: string[];
    runReportPath: string;
    error?: string;
}

/**
 * Run a single eval scenario in a temporary sandbox
 */
export async function runEvalScenario(
    scenario: EvalScenario,
    options: { verbose?: boolean; dryRun?: boolean } = {}
): Promise<EvalResult> {
    const { verbose = false, dryRun = false } = options;

    if (verbose) {
        console.log(`\n📝 Running scenario: ${scenario.id}`);
        console.log(`   Goal: ${scenario.goal}`);
    }

    // Create temp sandbox
    const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), `kotef-eval-${scenario.id}-`));

    try {
        // Copy fixture if provided
        if (scenario.fixtureDir) {
            const fixturePath = path.join(process.cwd(), 'scripts/eval/fixtures', scenario.fixtureDir);
            await copyDir(fixturePath, sandboxDir);
            if (verbose) console.log(`   📁 Copied fixture from ${scenario.fixtureDir}`);
        }

        if (dryRun) {
            return {
                scenarioId: scenario.id,
                success: true,
                terminalStatus: 'dry_run',
                metrics: { steps: 0, commandsUsed: 0, testRunsUsed: 0, webRequestsUsed: 0, duration: 0, terminalStatus: 'dry_run' },
                violations: [],
                runReportPath: ''
            };
        }

        // Run kotef
        const startTime = Date.now();
        const kotefBinPath = path.join(process.cwd(), 'bin/kotef.js');

        const cmd = `node "${kotefBinPath}" run --root "${sandboxDir}" --goal "${scenario.goal}" --profile ${scenario.profile} --scope ${scenario.scope} --yolo`;

        if (verbose) console.log(`   🚀 Executing: ${cmd}`);

        try {
            execSync(cmd, {
                stdio: verbose ? 'inherit' : 'pipe',
                cwd: sandboxDir,
                timeout: 300000, // 5 minutes
                env: { ...process.env, KOTEF_EVAL_MODE: 'true' }
            });
        } catch (execError: any) {
            // Non-zero exit is expected for some scenarios (e.g., aborted)
            if (verbose) console.log(`   ⚠️  Process exited with code ${execError.status}`);
        }

        const duration = Date.now() - startTime;

        // Find and parse run report
        const sddRunsDir = path.join(sandboxDir, '.sdd/runs');
        let runReportPath = '';
        let metrics: EvalMetrics = {
            steps: 0,
            commandsUsed: 0,
            testRunsUsed: 0,
            webRequestsUsed: 0,
            duration: duration / 1000,
            terminalStatus: 'unknown'
        };

        try {
            const runFiles = await fs.readdir(sddRunsDir);
            if (runFiles.length > 0) {
                // Get latest run report
                const latestRun = runFiles.sort().reverse()[0];
                runReportPath = path.join(sddRunsDir, latestRun);
                metrics = await parseRunReport(runReportPath);
                metrics.duration = duration / 1000;
            }
        } catch (err) {
            if (verbose) console.log(`   ⚠️  Could not parse run report: ${(err as Error).message}`);
        }

        // Check thresholds
        const violations = checkThresholds(scenario, metrics);

        // Determine success
        const statusMatch = scenario.expectedStatus.includes(metrics.terminalStatus);
        const noViolations = violations.length === 0;
        const success = statusMatch && noViolations;

        if (verbose) {
            console.log(`   📊 Metrics: ${JSON.stringify(metrics)}`);
            console.log(`   ${success ? '✅' : '❌'} Result: ${success ? 'PASS' : 'FAIL'}`);
            if (violations.length > 0) {
                console.log(`   ⚠️  Violations: ${violations.join(', ')}`);
            }
        }

        return {
            scenarioId: scenario.id,
            success,
            terminalStatus: metrics.terminalStatus,
            metrics,
            violations,
            runReportPath
        };

    } catch (error: any) {
        return {
            scenarioId: scenario.id,
            success: false,
            terminalStatus: 'error',
            metrics: { steps: 0, commandsUsed: 0, testRunsUsed: 0, webRequestsUsed: 0, duration: 0, terminalStatus: 'error' },
            violations: [],
            runReportPath: '',
            error: error.message
        };
    } finally {
        // Cleanup sandbox
        try {
            await fs.rm(sandboxDir, { recursive: true, force: true });
        } catch (err) {
            // Ignore cleanup errors
        }
    }
}

/**
 * Parse run report markdown to extract metrics
 */
async function parseRunReport(reportPath: string): Promise<EvalMetrics> {
    const content = await fs.readFile(reportPath, 'utf-8');

    // Extract budget usage
    const commandsMatch = content.match(/Commands[:\s]+(\d+)\s*\/\s*(\d+)/i);
    const testsMatch = content.match(/Test Runs[:\s]+(\d+)\s*\/\s*(\d+)/i);
    const webMatch = content.match(/Web Requests[:\s]+(\d+)\s*\/\s*(\d+)/i);

    // Extract terminal status
    const statusMatch = content.match(/\*\*Status\*\*:\s*`?(\w+)`?/i) ||
        content.match(/terminalStatus[:\s]+`?(\w+)`?/i);

    // Extract steps if available
    const stepsMatch = content.match(/Total Steps[:\s]+(\d+)/i) ||
        content.match(/Steps[:\s]+(\d+)/i);

    return {
        steps: parseInt(stepsMatch?.[1] || '0'),
        commandsUsed: parseInt(commandsMatch?.[1] || '0'),
        testRunsUsed: parseInt(testsMatch?.[1] || '0'),
        webRequestsUsed: parseInt(webMatch?.[1] || '0'),
        duration: 0, // Will be set by caller
        terminalStatus: statusMatch?.[1] || 'unknown'
    };
}

/**
 * Check if metrics violate scenario thresholds
 */
function checkThresholds(scenario: EvalScenario, metrics: EvalMetrics): string[] {
    const violations: string[] = [];

    if (scenario.thresholds.maxCommands && metrics.commandsUsed > scenario.thresholds.maxCommands) {
        violations.push(`Commands exceeded: ${metrics.commandsUsed} > ${scenario.thresholds.maxCommands}`);
    }

    if (scenario.thresholds.maxTestRuns && metrics.testRunsUsed > scenario.thresholds.maxTestRuns) {
        violations.push(`Test runs exceeded: ${metrics.testRunsUsed} > ${scenario.thresholds.maxTestRuns}`);
    }

    if (scenario.thresholds.maxWebRequests && metrics.webRequestsUsed > scenario.thresholds.maxWebRequests) {
        violations.push(`Web requests exceeded: ${metrics.webRequestsUsed} > ${scenario.thresholds.maxWebRequests}`);
    }

    if (scenario.thresholds.maxSteps && metrics.steps > scenario.thresholds.maxSteps) {
        violations.push(`Steps exceeded: ${metrics.steps} > ${scenario.thresholds.maxSteps}`);
    }

    return violations;
}

/**
 * Generate evaluation summary report
 */
export function generateEvalReport(results: EvalResult[]): string {
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const total = results.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    let report = '\n' + '='.repeat(60) + '\n';
    report += '📊 EVALUATION SUMMARY\n';
    report += '='.repeat(60) + '\n\n';

    report += `**Results**: ${passed}/${total} passed (${passRate}%)\n\n`;

    // Summary table
    report += '| Scenario | Status | Commands | Tests | Web | Time |\n';
    report += '|----------|--------|----------|-------|-----|------|\n';

    for (const result of results) {
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        const cmd = result.metrics.commandsUsed;
        const tests = result.metrics.testRunsUsed;
        const web = result.metrics.webRequestsUsed;
        const time = result.metrics.duration.toFixed(1) + 's';

        report += `| ${result.scenarioId} | ${status} | ${cmd} | ${tests} | ${web} | ${time} |\n`;
    }

    // Failures detail
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
        report += '\n## ❌ Failures\n\n';
        for (const result of failures) {
            report += `### ${result.scenarioId}\n`;
            report += `- Status: ${result.terminalStatus}\n`;
            if (result.error) {
                report += `- Error: ${result.error}\n`;
            }
            if (result.violations.length > 0) {
                report += `- Violations:\n`;
                result.violations.forEach(v => report += `  - ${v}\n`);
            }
            report += '\n';
        }
    }

    report += '='.repeat(60) + '\n';

    return report;
}

/**
 * Copy directory recursively
 */
async function copyDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}
