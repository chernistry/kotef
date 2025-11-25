import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

import { runCommand } from '../../tools/test_runner.js';
import { resolveExecutionProfile, PROFILE_POLICIES } from '../profiles.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export function verifierNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('verifier');
        log.info('Verifier node started');

        async function detectTestCommand(projectContext: string = '', rootDir: string = '.'): Promise<string> {
            // Check for package.json test script
            try {
                const pkgJsonPath = path.join(rootDir, 'package.json');
                const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
                if (pkgJson.scripts && pkgJson.scripts.test) {
                    return 'npm test';
                }
            } catch (e) {
                // No package.json
            }

            // Detect test framework from project context
            if (projectContext.includes('Python') || projectContext.includes('pytest')) {
                return 'pytest';
            }
            if (projectContext.includes('Go')) {
                return 'go test ./...';
            }

            return 'npm test';
        }
        const executionProfile = resolveExecutionProfile(state);
        const policy = PROFILE_POLICIES[executionProfile];
        const isTinyTask = state.taskScope === 'tiny';

        log.info('Verifier starting', { executionProfile, policy, taskScope: state.taskScope });

        if (executionProfile === 'smoke' || (isTinyTask && executionProfile !== 'strict')) {
            const reason = executionProfile === 'smoke'
                ? 'SKIPPED (smoke profile)'
                : 'SKIPPED (tiny task scope)';
            log.info('Skipping automated tests due to profile/task scope.', { reason });
            return {
                testResults: {
                    command: reason,
                    exitCode: 0,
                    stdout: 'Automated tests skipped; run the primary command manually if desired.',
                    stderr: '',
                    passed: true
                },
                done: true
            };
        }

        // Detect test command
        const testCommand = await detectTestCommand(state.sdd.project, cfg.rootDir!);
        log.info('Detected test command', { testCommand });

        const result = await runCommand(cfg, testCommand);
        log.info('Tests completed', { passed: result.passed });

        let failureHistory = state.failureHistory || [];
        if (!result.passed) {
            failureHistory = [
                ...failureHistory,
                {
                    step: 'verifier',
                    error: `Test failed: ${result.failureSummary || result.stderr || 'Unknown error'}`,
                    timestamp: Date.now()
                }
            ];
        }

        // Goal-First DoD logic (Ticket 13)
        const MAX_GOAL_FIRST_ATTEMPTS = 3;
        const attempts = failureHistory.filter(f => f.step === 'verifier').length;

        let done = result.passed;
        let completionReason: string | undefined;

        // For fast/yolo profiles, allow "functionally done" even if tests fail
        if (!result.passed && (executionProfile === 'fast' || executionProfile === 'yolo')) {
            const maxAttempts = executionProfile === 'yolo' ? 2 : MAX_GOAL_FIRST_ATTEMPTS;

            if (attempts >= maxAttempts) {
                // Check if failures are non-critical
                const isNonCritical = result.failureKind !== 'runtime_error' &&
                    result.failureKind !== 'compilation';

                if (isNonCritical) {
                    done = true;
                    completionReason = `Functionally done after ${attempts} attempts. ` +
                        `Remaining issues: ${result.failureKind} (${result.failureSummary})`;
                    log.info('Marking as functionally done (goal-first DoD)', {
                        executionProfile,
                        attempts,
                        failureKind: result.failureKind
                    });
                }
            }
        }

        // Load prompt for potential LLM-based verification (currently unused)
        const promptTemplate = await import('../../core/prompts.js').then(m => m.loadRuntimePrompt('verifier'));

        return {
            testResults: result,
            failureHistory,
            done,
            ...(completionReason && {
                plan: {
                    ...state.plan,
                    completionReason
                }
            })
        }
    };
}
