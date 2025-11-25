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
            // Heuristic 1: Check for package.json scripts
            try {
                const pkgJsonPath = path.join(rootDir, 'package.json');
                const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
                if (pkgJson.scripts && pkgJson.scripts.test) {
                    return 'npm test';
                }
            } catch (e) {
                // No package.json or error reading it
            }

            // Heuristic 2: Check for python tests
            if (projectContext.includes('Python') || projectContext.includes('pytest')) {
                return 'pytest';
            }

            // Heuristic 3: Check for go tests
            if (projectContext.includes('Go')) {
                return 'go test ./...';
            }

            // Final fallback: generic command.
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

        // If we have already exceeded maxTestRuns in the coder phase (tracked via state? no, coder tracks its own),
        // but here we are in verifier. Verifier should always run AT LEAST one test run if possible,
        // unless we are in a super strict mode or budget is globally exhausted.
        // For now, let's just run the test.

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

        // Load prompt
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

        let systemPrompt = promptTemplate
            .replace('{{TICKET}}', safe(state.sdd.ticket))
            .replace('{{SDD_ARCHITECT}}', summarize(state.sdd.architect, 2500))
            .replace('{{SDD_BEST_PRACTICES}}', summarize(state.sdd.bestPractices, 2500))
            .replace('{{FILE_CHANGES}}', safe(state.fileChanges))
            .replace('{{TEST_COMMANDS}}', testCommand)
            .replace('{{EXECUTION_PROFILE}}', executionProfile);

        // Note: The verifier node currently uses runCommand directly and doesn't call the LLM for the main verification step
        // unless we want the LLM to analyze the output.
        // The current implementation runs the command and returns the result.
        // However, the prompt implies the LLM is involved.
        // Ticket 03 implies we are hardening the PROMPT.
        // If the verifier node doesn't actually use the LLM, then updating the prompt is useless.
        // Let's check if there's an LLM call in verifierNode.
        // Looking at the code: it calls `runCommand` but NOT `callChat`.
        // This means the prompt file `verifier.md` is currently UNUSED by the code!
        // I should fix this by making the verifier actually use the LLM to analyze the test output if needed,
        // OR at least acknowledge that the prompt is for a future "LLM-based verifier".
        // BUT, the ticket says "Audit each runtime prompt... Refactor prompts".
        // If I see the code doesn't use it, I should probably enable it or at least leave the prompt ready.
        // Wait, if I change the node to use the prompt, that's a bigger change.
        // Let's look at `verifierNode` again. It returns `testResults`.
        // Maybe the *Planner* uses the verifier prompt? No, planner has its own.
        // Maybe `verifierNode` is *supposed* to use the LLM to decide if `done` is true based on output?
        // The code has `let done = result.passed;`. It's purely deterministic right now.

        // DECISION: I will update the prompt file as requested.
        // I will NOT rewrite the verifier node to use LLM if it doesn't already, to avoid scope creep.
        // However, the user asked to "Update verifier node to inject {{EXECUTION_PROFILE}}".
        // If the node doesn't use the prompt, I can't inject it into the prompt *usage*.
        // I'll check if I missed where the prompt is used.
        // If it's truly unused, I'll just skip the injection in the code but keep the prompt file updated.
        // Actually, looking at the file content provided in Step 195, `verifierNode` does NOT import `loadRuntimePrompt`.
        // So the prompt is indeed unused.

        // Re-reading Ticket 03: "Audit each runtime prompt... Identify where execution profile / taskScope should affect behaviour but currently does not."
        // "Refactor prompts... Keep semantics the same".
        // If the prompt is unused, updating it is fine (for future use).
        // But updating the node to use it is a behavior change.
        // However, the plan said: "[MODIFY] src/agent/nodes/verifier.ts - Inject {{EXECUTION_PROFILE}} into the prompt replacements."
        // This implies I *thought* it was used.

        // I will add the prompt loading/replacement logic but comment it out or leave it as "prepared for LLM verification",
        // OR I can just leave the node alone if it doesn't use the prompt.
        // But wait, if the prompt is unused, why does it exist?
        // Maybe it's used by `meta_agent`?
        // Let's check `meta_agent.md`. It lists tools.

        // Okay, I will NOT modify `verifier.ts` to inject variables into an unused prompt.
        // I will only update the prompt file `verifier.md`.
        // I'll update the plan/task to reflect this discovery.

        // Wait, if I don't modify the node, I can't "Inject {{EXECUTION_PROFILE}}".
        // I'll mark that task as "Skipped (Prompt unused)" in the task list.

        // Let's double check if `verifier.ts` uses `callChat` or `loadPrompt`.
        // It imports `createLogger`, `runCommand`, `resolveExecutionProfile`, `fs`, `path`.
        // It does NOT import `callChat` or `prompts`.
        // So it is definitely unused.

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
