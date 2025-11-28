import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { execa } from 'execa';

import { runCommand } from '../../tools/test_runner.js';
import { resolveExecutionProfile, PROFILE_POLICIES } from '../profiles.js';
import { detectCommands, DetectedCommands } from '../utils/verification.js';
import { recordFunctionalProbe, deriveFunctionalStatus } from '../utils/functional_checks.js';
import { canUseFastPath } from '../utils/fast_path.js';

export function verifierNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('verifier');
        log.info('Verifier node started');
        const verificationStart = Date.now();

        // 1. Detect commands if not already in state
        let detected = state.detectedCommands;
        if (!detected) {
            detected = await detectCommands(cfg);
            log.info('Detected verification commands', { detected });
        }

        const executionProfile = resolveExecutionProfile(state);
        const policy = PROFILE_POLICIES[executionProfile];
        const isTinyTask = state.taskScope === 'tiny';

        log.info('Verifier starting', { executionProfile, policy, taskScope: state.taskScope, stack: detected?.stack });

        // 2. Select commands based on profile & goal
        let commandsToRun: string[] = [];
        const goal = state.sdd.goal || '';

        // Heuristic: if goal mentions "build", force build
        const forceBuild = goal.toLowerCase().includes('build');
        const hasFileChanges = Object.keys(state.fileChanges || {}).length > 0;

        // Priority 1: Syntax Sanity (Ticket 27)
        // If files changed, always try to run a cheap syntax check first.
        if (hasFileChanges && detected.syntaxCheckCommand) {
            commandsToRun.push(detected.syntaxCheckCommand);
        }

        // Priority 2: Profile-based tests
        // Priority 2: Profile-based tests
        // Fix for Planner-Verifier loop: Chain commands instead of exclusive OR

        if (executionProfile === 'strict') {
            if (detected.primaryTest) commandsToRun.push(detected.primaryTest);
            if (detected.buildCommand) commandsToRun.push(detected.buildCommand);
            if (detected.lintCommand && detected.lintCommand !== detected.syntaxCheckCommand) commandsToRun.push(detected.lintCommand);
        } else if (executionProfile === 'fast') {
            // Align with error-first strategy: prefer the same diagnostic command coder used.
            if (detected.diagnosticCommand) {
                commandsToRun.push(detected.diagnosticCommand);
            }

            // If build is forced or likely needed, add it
            if (forceBuild && detected.buildCommand && !commandsToRun.includes(detected.buildCommand)) {
                commandsToRun.push(detected.buildCommand);
            }

            // ALWAYS try to run a test if we haven't yet (unless diagnostic IS the test)
            // This prevents "build only" loops
            const hasTest = commandsToRun.some(c => c.includes('test') || c === detected.primaryTest || c === detected.smokeTest);
            if (!hasTest) {
                if (detected.primaryTest) commandsToRun.push(detected.primaryTest);
                else if (detected.smokeTest) commandsToRun.push(detected.smokeTest);
            }
        } else {
            // smoke / yolo
            if (!isTinyTask && detected?.diagnosticCommand) {
                commandsToRun.push(detected.diagnosticCommand);
            }

            if (forceBuild && detected?.buildCommand && !commandsToRun.includes(detected.buildCommand)) {
                commandsToRun.push(detected.buildCommand);
            }

            // Ensure we run *something* that verifies functionality
            const hasTest = commandsToRun.some(c => c.includes('test') || c === detected.primaryTest || c === detected.smokeTest);
            if (!hasTest) {
                if (detected?.smokeTest) {
                    commandsToRun.push(detected.smokeTest);
                } else if (detected?.primaryTest && !isTinyTask) {
                    commandsToRun.push(detected.primaryTest);
                }
            }
        }

        // Deduplicate
        commandsToRun = [...new Set(commandsToRun)];

        if (commandsToRun.length === 0) {
            const reason = 'No suitable verification commands found for this stack/profile.';
            log.info(reason);
            return {
                detectedCommands: detected,
                testResults: {
                    command: 'none',
                    passed: true,
                    stdout: reason
                },
                done: true
            };
        }

        // Budget check for test runs (Ticket 19)
        if (state.budget && state.budget.testRunsUsed >= state.budget.maxTestRuns) {
            log.warn('Test run budget exhausted, skipping verification', {
                used: state.budget.testRunsUsed,
                max: state.budget.maxTestRuns
            });

            const reason = 'Test budget exhausted; assuming success for non-strict profiles.';
            const assumeSuccess = ['smoke', 'yolo'].includes(executionProfile);

            return {
                detectedCommands: detected,
                testResults: {
                    command: 'none (budget exhausted)',
                    passed: assumeSuccess,
                    stdout: reason
                },
                done: assumeSuccess,
                budget: state.budget
            };
        }

        // 3. Run commands
        const results = [];
        let allPassed = true;
        let currentDiagnostics = state.diagnosticsLog || [];

        // Import diagnostics utils
        const { parseDiagnostics, mergeDiagnostics } = await import('../utils/diagnostics.js');

        for (const cmd of commandsToRun) {
            log.info(`Running verification command: ${cmd}`);
            const res = await runCommand(cfg, cmd);

            // Increment test run budget counter
            if (state.budget) {
                state.budget.testRunsUsed++;
            }

            results.push({
                command: cmd,
                passed: res.passed,
                exitCode: res.exitCode,
                stdout: res.stdout,
                stderr: res.stderr
            });

            // Parse diagnostics
            const source = cmd.includes('test') ? 'test' : 'build'; // simplistic source detection
            const newDiagnostics = parseDiagnostics(res.stdout + '\n' + res.stderr, source);
            currentDiagnostics = mergeDiagnostics(currentDiagnostics, newDiagnostics);

            // Record functional probe (Ticket 28)
            const probes = recordFunctionalProbe(cmd, res, 'verifier');
            if (probes.length > 0) {
                // We need to return these.
                // Verifier doesn't loop like coder, so we can just append to a list to return.
                // But wait, we need to add them to the state passed to deriveFunctionalStatus later?
                // Yes.
                if (!state.functionalChecks) state.functionalChecks = [];
                state.functionalChecks.push(...probes);
            }

            if (!res.passed) {
                allPassed = false;
                // In strict mode, fail fast? Or run all to get full picture?
                // Let's run all to give full context to planner.
            }
        }

        // Run LSP diagnostics if appropriate (Ticket 33)
        // Use full LSP server for file-level diagnostics when possible
        // Only for TypeScript/JavaScript projects
        const isJsProject = detected.stack === 'node' || detected.stack === 'vite_frontend';
        if (
            cfg.enableTsLspDiagnostics &&
            isJsProject &&
            (executionProfile === 'strict' || (executionProfile === 'fast' && hasFileChanges))
        ) {
            log.info('LSP condition met', {
                enableTsLspDiagnostics: cfg.enableTsLspDiagnostics,
                isJsProject,
                executionProfile,
                hasFileChanges
            });
            try {
                const { runTsLspDiagnosticsViaServer } = await import('../../tools/diagnostics.js');

                // Get changed files for targeted diagnostics (max 50 files to avoid overhead)
                const changedFiles = hasFileChanges
                    ? Object.keys(state.fileChanges || {})
                        .filter(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'))
                        .slice(0, 50)
                    : undefined;

                log.info('Running LSP diagnostics', {
                    profile: executionProfile,
                    fileCount: changedFiles?.length || 'project-wide'
                });

                const lspDiagnostics = await runTsLspDiagnosticsViaServer(cfg.rootDir, changedFiles);

                if (lspDiagnostics.length > 0) {
                    log.info(`LSP found ${lspDiagnostics.length} diagnostics`);
                    // Convert to DiagnosticsEntry
                    const lspEntries: import('../utils/diagnostics.js').DiagnosticsEntry[] = lspDiagnostics.map(d => ({
                        source: 'lsp',
                        file: d.file,
                        location: { line: d.line, column: d.column },
                        message: `${d.code ? `[${d.code}] ` : ''}${d.message}`,
                        severity: d.severity,
                        firstSeenAt: Date.now(),
                        lastSeenAt: Date.now(),
                        occurrenceCount: 1
                    }));
                    currentDiagnostics = mergeDiagnostics(currentDiagnostics, lspEntries);

                    // LSP as additional gate (Ticket 32/33)
                    // In strict mode, LSP errors block verification
                    if (executionProfile === 'strict' && lspDiagnostics.some(d => d.severity === 'error')) {
                        allPassed = false;
                        log.warn('LSP errors detected in strict mode, marking as failed.');
                    }
                } else {
                    log.info('LSP diagnostics: no issues found');
                }
            } catch (e: any) {
                log.warn('Failed to run LSP diagnostics', { error: e.message || String(e) });
            }
        }

        // Ticket 56: Runtime Log Verification for Services
        // If we ran a service command, check logs for runtime errors
        const ranServiceCommand = commandsToRun.some(cmd => detected.serviceCommands?.includes(cmd));
        if (ranServiceCommand) {
            try {
                const { scanLogsForErrors } = await import('../utils/logs.js');
                // Default to checking logs/run.log (kotef's own capture) and maybe project logs
                // For now, we assume kotef captures stdout/stderr to logs/run.log or similar if configured,
                // BUT actually kotef CLI captures to a file.
                // Also check for common project log files.
                const logPaths = ['logs/run.log', 'run.log', 'app.log', 'debug.log', 'error.log'];

                log.info('Scanning runtime logs for service errors...', { logPaths });
                const logErrors = await scanLogsForErrors(cfg.rootDir, {
                    logPaths,
                    sinceMs: verificationStart
                });

                if (logErrors.length > 0) {
                    log.warn(`Found ${logErrors.length} runtime errors in logs`, { errors: logErrors.slice(0, 3) });

                    const logDiagnostics: import('../utils/diagnostics.js').DiagnosticsEntry[] = logErrors.map(e => ({
                        source: 'runtime_log',
                        file: e.file,
                        message: e.message,
                        severity: 'error',
                        firstSeenAt: e.timestamp || Date.now(),
                        lastSeenAt: e.timestamp || Date.now(),
                        occurrenceCount: 1
                    }));

                    currentDiagnostics = mergeDiagnostics(currentDiagnostics, logDiagnostics);

                    // Fail verification if runtime errors are found
                    allPassed = false;
                }
            } catch (e) {
                log.warn('Failed to scan runtime logs', { error: e });
            }
        }

        // 4. Update failure history
        let failureHistory = state.failureHistory || [];
        let lastTestSignature = state.lastTestSignature;
        let sameErrorCount = state.sameErrorCount || 0;

        if (!allPassed) {
            const firstFail = results.find(r => !r.passed)!;
            const errorText = firstFail.stderr || firstFail.stdout || 'Unknown error';
            const currentSignature = `${firstFail.command}:${errorText.slice(0, 200)}`;

            if (currentSignature === lastTestSignature) {
                sameErrorCount++;
            } else {
                sameErrorCount = 1;
                lastTestSignature = currentSignature;
            }

            failureHistory = [
                ...failureHistory,
                {
                    step: 'verifier',
                    error: `Command failed: ${firstFail.command} -> ${errorText.slice(0, 500)}`,
                    timestamp: Date.now()
                }
            ];
        } else {
            sameErrorCount = 0;
            lastTestSignature = undefined;

            // Ticket 67: Continuous Git Checkpoint (Commit on Green)
            if (cfg.gitEnabled) {
                try {
                    const cwd = cfg.rootDir || process.cwd();
                    // Stage all changes
                    await execa('git', ['add', '.'], { cwd });

                    // Check for changes
                    const { stdout: status } = await execa('git', ['status', '--porcelain'], { cwd });

                    if (status.trim()) {
                        const commitMsg = 'chore: auto-checkpoint - verification passed';
                        await execa('git', ['commit', '-m', commitMsg], { cwd });
                        log.info('Created git checkpoint', { commitMsg });
                    }
                } catch (gitErr: any) {
                    log.warn('Failed to create git checkpoint', { error: gitErr.message });
                }
            }
        }

        // Compute diagnostics summary
        const { summarizeDiagnostics } = await import('../utils/diagnostics.js');
        const diagnosticsSummary = summarizeDiagnostics(currentDiagnostics);

        // 5. LLM Evaluation (Partial Success Logic)
        const promptTemplate = await import('../../core/prompts.js').then(m => m.loadRuntimePrompt('verifier'));

        const safe = (value: unknown) => {
            if (value === undefined || value === null) return '';
            if (typeof value === 'string') return value;
            return JSON.stringify(value, null, 2);
        };
        const summarize = (value: unknown, maxChars: number) => {
            const text = safe(value);
            if (text.length <= maxChars) return text;
            return text.slice(0, maxChars) + '\n\n...[truncated]';
        };

        const functionalOk = deriveFunctionalStatus(state.functionalChecks);

        const replacements: Record<string, string> = {
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{SDD_ARCHITECT}}': summarize(state.sdd.architect, 2500),
            '{{SDD_BEST_PRACTICES}}': summarize(state.sdd.bestPractices, 2500),
            '{{FILE_CHANGES}}': safe(state.fileChanges),
            '{{TEST_COMMANDS}}': commandsToRun.join(', '),
            '{{EXECUTION_PROFILE}}': executionProfile,
            '{{TASK_SCOPE}}': state.taskScope || 'normal',
            '{{TEST_RESULTS}}': safe(results),
            '{{FUNCTIONAL_OK}}': functionalOk ? 'true' : 'false',
            '{{DIAGNOSTICS}}': diagnosticsSummary
        };

        let systemPrompt = promptTemplate;
        for (const [token, value] of Object.entries(replacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...state.messages,
            {
                role: 'user',
                content: `Verification Results:\n${safe(results)}\n\nEvaluate if the goal is met. If global tests fail but the goal is achieved, consider partial success.`
            }
        ];

        let decision: any;
        let attempts = 0;
        const maxAttempts = 3;

        // Ticket 08: Fast path for simple changes
        const stateForFastPath = {
            ...state,
            testResults: results,
            diagnosticsLog: currentDiagnostics
        };
        if (allPassed && canUseFastPath(stateForFastPath)) {
            log.info('Fast path: skipping planner re-evaluation', {
                profile: executionProfile,
                filesChanged: Object.keys(state.fileChanges || {}).length
            });
            return {
                detectedCommands: detected,
                testResults: results,
                failureHistory,
                lastTestSignature,
                sameErrorCount,
                done: true,
                terminalStatus: 'done_success',
                functionalChecks: state.functionalChecks,
                diagnosticsLog: currentDiagnostics,
                diagnosticsSummary
            };
        }

        while (attempts < maxAttempts) {
            try {
                attempts++;
                const response = await import('../../core/llm.js').then(m => m.callChat(cfg, messages as any, {
                    model: cfg.modelFast,
                    response_format: { type: 'json_object' } as any
                }));
                const content = response.messages[response.messages.length - 1].content || '{}';
                decision = JSON.parse(content);
                break; // Success
            } catch (e) {
                log.warn(`Verifier LLM attempt ${attempts} failed`, { error: e });
                if (attempts >= maxAttempts) {
                    log.error('Verifier LLM failed after retries', { error: e });
                    // Fail-closed fallback
                    decision = {
                        status: allPassed ? 'blocked' : 'failed',
                        summary: `Verifier internal error: ${e instanceof Error ? e.message : String(e)}. Diagnostics: ${diagnosticsSummary}`,
                        next: 'planner',
                        notes: 'Fallback due to LLM error'
                    };
                }
                // Wait briefly before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }


        // Enforce fail-closed semantics (Ticket 31)
        if (decision.next === 'done') {
            if (executionProfile === 'strict' && !allPassed) {
                log.warn('Enforcing fail-closed: Strict profile requires all tests to pass.', { decision });
                decision.next = 'planner';
                decision.status = 'failed';
                decision.notes = (decision.notes || '') + ' [System: Strict profile requires all tests to pass]';
                decision.terminalStatus = undefined;
            }
            // If there are critical diagnostics (e.g. build errors), we should probably block too.
            // For now, relying on allPassed covers most cases, as build errors usually mean command failed.
        }

        return {
            detectedCommands: detected,
            testResults: results,
            failureHistory,
            lastTestSignature,
            sameErrorCount,
            done: decision.next === 'done',
            terminalStatus: decision.terminalStatus, // e.g. 'done_partial'
            functionalChecks: state.functionalChecks,
            diagnosticsLog: currentDiagnostics,
            diagnosticsSummary
        };
    };
}
