import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

import { runCommand } from '../../tools/test_runner.js';
import { resolveExecutionProfile, PROFILE_POLICIES } from '../profiles.js';
import { detectCommands, DetectedCommands } from '../utils/verification.js';

export function verifierNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('verifier');
        log.info('Verifier node started');

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

        if (executionProfile === 'strict') {
            if (detected?.primaryTest) commandsToRun.push(detected.primaryTest);
            if (detected?.buildCommand) commandsToRun.push(detected.buildCommand);
            if (detected?.lintCommand) commandsToRun.push(detected.lintCommand);
        } else if (executionProfile === 'fast') {
            if (forceBuild && detected?.buildCommand) {
                commandsToRun.push(detected.buildCommand);
            }
            if (detected?.primaryTest) {
                commandsToRun.push(detected.primaryTest);
            } else if (detected?.smokeTest) {
                commandsToRun.push(detected.smokeTest);
            }
        } else {
            // smoke / yolo
            if (forceBuild && detected?.buildCommand) {
                commandsToRun.push(detected.buildCommand);
            } else if (detected?.smokeTest) {
                commandsToRun.push(detected.smokeTest);
            } else if (detected?.primaryTest && !isTinyTask) {
                // Fallback to primary if no smoke test, but skip for tiny tasks if it looks heavy
                commandsToRun.push(detected.primaryTest);
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
                done: true // If we can't verify, we assume done? Or maybe ask human? For now, assume done if no tests found.
            };
        }

        // 3. Run commands
        const results = [];
        let allPassed = true;

        for (const cmd of commandsToRun) {
            log.info(`Running verification command: ${cmd}`);
            const res = await runCommand(cfg, cmd);
            results.push({
                command: cmd,
                passed: res.passed,
                exitCode: res.exitCode,
                stdout: res.stdout,
                stderr: res.stderr
            });
            if (!res.passed) {
                allPassed = false;
                // In strict mode, fail fast? Or run all to get full picture?
                // Let's run all to give full context to planner.
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
        }

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

        const replacements: Record<string, string> = {
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{SDD_ARCHITECT}}': summarize(state.sdd.architect, 2500),
            '{{SDD_BEST_PRACTICES}}': summarize(state.sdd.bestPractices, 2500),
            '{{FILE_CHANGES}}': safe(state.fileChanges),
            '{{TEST_COMMANDS}}': commandsToRun.join(', '),
            '{{EXECUTION_PROFILE}}': executionProfile,
            '{{TASK_SCOPE}}': state.taskScope || 'normal',
            '{{TEST_RESULTS}}': safe(results)
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
        try {
            const response = await import('../../core/llm.js').then(m => m.callChat(cfg, messages as any, {
                model: cfg.modelFast,
                response_format: { type: 'json_object' } as any
            }));
            const content = response.messages[response.messages.length - 1].content || '{}';
            decision = JSON.parse(content);
        } catch (e) {
            log.error('Verifier LLM failed', { error: e });
            decision = {
                status: allPassed ? 'passed' : 'failed',
                summary: allPassed ? 'All checks passed' : 'Checks failed',
                next: allPassed ? 'done' : 'planner',
                notes: 'Fallback due to LLM error'
            };
        }

        return {
            detectedCommands: detected,
            testResults: results,
            failureHistory,
            lastTestSignature,
            sameErrorCount,
            done: decision.next === 'done',
            terminalStatus: decision.terminalStatus // e.g. 'done_partial'
        };
    };
}
