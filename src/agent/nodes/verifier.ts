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

        if ((executionProfile as string) === 'smoke' || (isTinyTask && executionProfile !== 'strict')) {
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

        let result: any;
        let skipped = false;

        if ((executionProfile as string) === 'smoke' || (isTinyTask && executionProfile !== 'strict')) {
            const reason = executionProfile === 'smoke'
                ? 'SKIPPED (smoke profile)'
                : 'SKIPPED (tiny task scope)';
            log.info('Skipping automated tests due to profile/task scope.', { reason });
            result = {
                command: reason,
                exitCode: 0,
                stdout: 'Automated tests skipped; run the primary command manually if desired.',
                stderr: '',
                passed: true
            };
            skipped = true;
        } else {
            result = await runCommand(cfg, testCommand);
            log.info('Tests completed', { passed: result.passed });
        }

        let failureHistory = state.failureHistory || [];
        let lastTestSignature = state.lastTestSignature;
        let sameErrorCount = state.sameErrorCount || 0;

        if (!result.passed && !skipped) {
            const errorText = result.failureSummary || result.stderr || 'Unknown error';
            // Simple signature: command + first 200 chars of error
            const currentSignature = `${testCommand}:${errorText.slice(0, 200)}`;

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
                    error: `Test failed: ${errorText}`,
                    timestamp: Date.now()
                }
            ];
        } else if (result.passed) {
            // Reset on success
            sameErrorCount = 0;
            lastTestSignature = undefined;
        }

        // Load prompt for LLM-based verification
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

        const replacements: Record<string, string> = {
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{SDD_ARCHITECT}}': summarize(state.sdd.architect, 2500),
            '{{SDD_BEST_PRACTICES}}': summarize(state.sdd.bestPractices, 2500),
            '{{FILE_CHANGES}}': safe(state.fileChanges),
            '{{TEST_COMMANDS}}': testCommand,
            '{{EXECUTION_PROFILE}}': executionProfile,
            '{{TASK_SCOPE}}': state.taskScope || 'normal',
            '{{TEST_RESULTS}}': safe(result) // Note: Prompt might not have {{TEST_RESULTS}} explicitly in Inputs section but it's useful to add or rely on context
        };

        // Inject test results into prompt if not already there (the prompt I wrote didn't have {{TEST_RESULTS}} in Inputs, but it had "Suggested test commands").
        // Wait, the prompt I wrote has:
        // - Planned/changed files: `{{FILE_CHANGES}}`
        // - Suggested test commands: `{{TEST_COMMANDS}}`
        // It DOES NOT have `{{TEST_RESULTS}}`. I should add it to the prompt or append it.
        // I will append it to the user message.

        let systemPrompt = promptTemplate;
        for (const [token, value] of Object.entries(replacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...state.messages,
            {
                role: 'user',
                content: `Test Results:\n${safe(result)}\n\nEvaluate the results and decide status.`
            }
        ];

        let decision: any;
        try {
            const response = await import('../../core/llm.js').then(m => m.callChat(cfg, messages as any, {
                model: cfg.modelFast,
                response_format: { type: 'json_object' } as any
            }));
            const content = response.messages[response.messages.length - 1].content || '{}';
            decision = JSON.parse(content);
        } catch (e) {
            log.error('Verifier LLM failed', { error: e });
            // Fallback logic
            decision = {
                status: result.passed ? 'passed' : 'failed',
                summary: result.passed ? 'Tests passed' : 'Tests failed',
                next: result.passed ? 'done' : 'planner',
                notes: 'Fallback due to LLM error'
            };
        }

        return {
            testResults: result,
            failureHistory,
            lastTestSignature,
            sameErrorCount,
            done: decision.next === 'done',
            // If planner is next, we might want to add a note to the plan?
            // But verifier just updates state. Planner reads testResults.
        };
    };
}
