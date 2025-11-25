import { AgentState, ExecutionProfile, TaskScope, BudgetState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { ChatMessage, callChat } from '../../core/llm.js';
import { loadRuntimePrompt } from '../../core/prompts.js';
import { createLogger } from '../../core/logger.js';
import { jsonrepair } from 'jsonrepair';
import { buildProjectSummary } from '../utils/project_summary.js';
import { deriveFunctionalStatus } from '../utils/functional_checks.js';
import { makeSnapshot, assessProgress } from '../utils/progress_controller.js';

function initializeBudget(profile: ExecutionProfile, scope: TaskScope): BudgetState {
    const zeros = { commandsUsed: 0, testRunsUsed: 0, webRequestsUsed: 0, commandHistory: [] };
    const budgets: Record<string, BudgetState> = {
        'strict-large': { maxCommands: 60, maxTestRuns: 10, maxWebRequests: 30, ...zeros },
        'strict-normal': { maxCommands: 40, maxTestRuns: 8, maxWebRequests: 20, ...zeros },
        'strict-tiny': { maxCommands: 20, maxTestRuns: 5, maxWebRequests: 10, ...zeros },
        'fast-large': { maxCommands: 50, maxTestRuns: 8, maxWebRequests: 25, ...zeros },
        'fast-normal': { maxCommands: 30, maxTestRuns: 5, maxWebRequests: 15, ...zeros },
        'fast-tiny': { maxCommands: 15, maxTestRuns: 3, maxWebRequests: 8, ...zeros },
        'smoke-large': { maxCommands: 30, maxTestRuns: 3, maxWebRequests: 15, ...zeros },
        'smoke-normal': { maxCommands: 20, maxTestRuns: 2, maxWebRequests: 10, ...zeros },
        'smoke-tiny': { maxCommands: 10, maxTestRuns: 1, maxWebRequests: 5, ...zeros },
        'yolo-large': { maxCommands: 40, maxTestRuns: 5, maxWebRequests: 20, ...zeros },
        'yolo-normal': { maxCommands: 25, maxTestRuns: 3, maxWebRequests: 12, ...zeros },
        'yolo-tiny': { maxCommands: 15, maxTestRuns: 2, maxWebRequests: 8, ...zeros },
    };
    const key = `${profile}-${scope}`;
    return budgets[key] || budgets['fast-normal'];
}

export function plannerNode(cfg: KotefConfig, chatFn = callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('planner');
        log.info('Planner node started');

        // Initialize budget if not present (Ticket 19)
        if (!state.budget) {
            const profile = state.runProfile || 'fast';
            const scope = state.taskScope || 'normal';
            state.budget = initializeBudget(profile, scope);
            log.info('Budget initialized', { profile, scope, budget: state.budget });
        }

        // Initialize project summary if not present (Ticket 20)
        if (!state.projectSummary) {
            try {
                const summary = await buildProjectSummary(cfg.rootDir || process.cwd(), cfg);
                state.projectSummary = summary;
                log.info('Project summary built', { summary });
            } catch (err) {
                log.warn('Failed to build project summary', { error: (err as Error).message });
                // Continue without summary - not critical
            }
        }

        const tryParseDecision = (raw: string) => {
            const trimmed = raw.trim();
            if (!trimmed) {
                throw new Error('Empty planner response');
            }
            try {
                return JSON.parse(trimmed);
            } catch (firstErr) {
                try {
                    const repaired = jsonrepair(trimmed);
                    return JSON.parse(repaired);
                } catch {
                    throw firstErr;
                }
            }
        };

        const promptTemplate = await loadRuntimePrompt('planner');
        const safe = (value: unknown) => {
            if (value === undefined || value === null) return '';
            if (typeof value === 'string') return value;
            return JSON.stringify(value, null, 2);
        };
        const summarize = (value: unknown, maxChars: number) => {
            const text = safe(value);
            if (text.length <= maxChars) return text;
            return text.slice(0, maxChars) + '\n\n...[truncated for planner; see SDD files for full spec]';
        };
        // Flow Control & Stop Rules (Ticket 14)
        const MAX_STEPS = 50;
        const MAX_LOOP_EDGE = 5;
        const currentSteps = (state.totalSteps || 0) + 1;

        // Progress / loop tracking
        const currentLoopCounters = state.loopCounters || {
            planner_to_researcher: 0,
            planner_to_verifier: 0,
            planner_to_coder: 0,
            lastResearchSignature: undefined,
            lastFileChangeCount: 0,
            lastTestSignature: undefined
        };

        const computeResearchSignature = () => {
            if (!state.researchResults) return undefined;
            try {
                const isArray = Array.isArray(state.researchResults);
                const length = isArray
                    ? state.researchResults.length
                    : Object.keys(state.researchResults).length;
                const lastQuery = state.researchQuality?.lastQuery;
                const payload = JSON.stringify({ lastQuery, length });
                return payload.slice(0, 256);
            } catch {
                return undefined;
            }
        };

        const newResearchSig = computeResearchSignature();
        let loopCounters = { ...currentLoopCounters };

        // Reset per-edge counters when we see clear signs of progress
        if (newResearchSig && newResearchSig !== currentLoopCounters.lastResearchSignature) {
            loopCounters.planner_to_researcher = 0;
            loopCounters.lastResearchSignature = newResearchSig;
        }

        const fileChangeCount = Object.keys(state.fileChanges || {}).length;
        if (fileChangeCount !== (currentLoopCounters.lastFileChangeCount ?? 0)) {
            loopCounters.planner_to_coder = 0;
            loopCounters.lastFileChangeCount = fileChangeCount;
        }

        const lastTestSig = state.lastTestSignature;
        if (lastTestSig && lastTestSig !== currentLoopCounters.lastTestSignature) {
            loopCounters.planner_to_verifier = 0;
            loopCounters.lastTestSignature = lastTestSig;
        }

        const replacements: Record<string, string> = {
            '{{GOAL}}': safe(state.sdd.goal),
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{PROJECT_SUMMARY}}': safe(JSON.stringify(state.projectSummary, null, 2)),
            '{{SDD_PROJECT}}': summarize(state.sdd.project, 2500),
            '{{SDD_ARCHITECT}}': summarize(state.sdd.architect, 2500),
            '{{SDD_BEST_PRACTICES}}': summarize(state.sdd.bestPractices, 2500),
            '{{STATE_PLAN}}': safe(state.plan),
            '{{RESEARCH_RESULTS}}': safe(state.researchResults),
            '{{RESEARCH_QUALITY}}': safe(state.researchQuality),
            '{{FILE_CHANGES}}': safe(state.fileChanges),
            '{{TEST_RESULTS}}': safe(state.testResults),
            '{{FAILURE_HISTORY}}': safe(state.failureHistory),
            '{{LOOP_COUNTERS}}': safe(state.loopCounters),
            '{{TOTAL_STEPS}}': safe(currentSteps),
            '{{TASK_SCOPE}}': state.taskScope || 'normal',
            '{{EXECUTION_PROFILE}}': state.runProfile || 'fast',
            '{{DETECTED_COMMANDS}}': safe(state.detectedCommands),
            '{{FUNCTIONAL_OK}}': deriveFunctionalStatus(state.functionalChecks) ? 'true' : 'false',
            '{{DIAGNOSTICS}}': (await import('../utils/diagnostics.js')).summarizeDiagnostics(state.diagnosticsLog),
        };

        // Budget exhaustion check (Ticket 19)
        if (state.budget) {
            const nearLimit =
                state.budget.commandsUsed >= state.budget.maxCommands ||
                state.budget.testRunsUsed >= state.budget.maxTestRuns ||
                state.budget.webRequestsUsed >= state.budget.maxWebRequests;

            if (nearLimit) {
                log.warn('Budget limits reached', { budget: state.budget });

                // Check if functional goal met despite budget exhaustion (Ticket 28)
                const functionalOk = deriveFunctionalStatus(state.functionalChecks);
                const isStrict = state.runProfile === 'strict';

                // In strict mode, we require tests to pass.
                // In non-strict, functionalOk is enough to declare partial success.
                const functionallyDone = state.testResults?.passed ||
                    (!isStrict && functionalOk);

                if (functionallyDone) {
                    return {
                        terminalStatus: 'done_partial',
                        plan: {
                            next: 'done',
                            reason: `Budget exhausted but functional goal met (functionalOk=${functionalOk}). Commands: ${state.budget.commandsUsed}/${state.budget.maxCommands}, Tests: ${state.budget.testRunsUsed}/${state.budget.maxTestRuns}`,
                            profile: state.runProfile,
                            plan: []
                        },
                        done: true,
                        budget: state.budget
                    };
                } else {
                    return {
                        terminalStatus: 'aborted_constraint',
                        plan: {
                            next: 'snitch',
                            reason: `Budget exhausted before goal completion. Commands: ${state.budget.commandsUsed}/${state.budget.maxCommands}, Tests: ${state.budget.testRunsUsed}/${state.budget.maxTestRuns}`,
                            profile: state.runProfile,
                            plan: []
                        },
                        done: true,
                        budget: state.budget
                    };
                }
            }
        }

        // (Ticket 30) Progress Controller: Check for stuck states
        const snapshot = makeSnapshot(state, 'planner');
        const progressHistory = [...(state.progressHistory || []), snapshot];
        const progressCheck = assessProgress(progressHistory);

        if (progressCheck.status === 'stuck_candidate') {
            log.warn('Agent appears stuck', { reason: progressCheck.reason });
            return {
                terminalStatus: 'aborted_stuck',
                plan: {
                    next: 'snitch',
                    reason: `${progressCheck.reason}`,
                    profile: state.runProfile,
                    plan: []
                },
                done: true,
                progressHistory
            };
        }

        if (currentSteps >= MAX_STEPS) {
            log.warn('Max steps reached, aborting', { steps: currentSteps });
            return {
                terminalStatus: 'aborted_stuck',
                plan: {
                    next: 'snitch',
                    reason: `Max steps limit reached (${MAX_STEPS}). The agent is stuck or looping indefinitely.`,
                    profile: state.runProfile,
                    plan: []
                },
                done: true // Snitch will handle logging
            };
        }

        // Check for bounded loops (Ticket 11)
        const MAX_FAILURES = 3;
        if (state.failureHistory && state.failureHistory.length >= MAX_FAILURES) {
            const lastFailure = state.failureHistory[state.failureHistory.length - 1];
            log.warn('Max failures reached, forcing snitch', { failures: state.failureHistory.length });
            return {
                terminalStatus: 'aborted_stuck',
                plan: {
                    next: 'snitch',
                    reason: `Max failures reached (${state.failureHistory.length}). Last error: ${lastFailure.error}`,
                    profile: state.runProfile,
                    plan: []
                },
                done: true
            };
        }

        let systemPrompt = promptTemplate;
        for (const [token, value] of Object.entries(replacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
        }

        // Use summaries if available (significantly reduces token usage)
        if (state.sddSummaries) {
            systemPrompt = systemPrompt.replaceAll('{{SDD_PROJECT}}', state.sddSummaries.projectSummary);
            systemPrompt = systemPrompt.replaceAll('{{SDD_ARCHITECT}}', state.sddSummaries.architectSummary);
            systemPrompt = systemPrompt.replaceAll('{{SDD_BEST_PRACTICES}}', state.sddSummaries.bestPracticesSummary);
        }

        // Add recent history to context
        const baseMessages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...state.messages
        ];

        baseMessages.push({
            role: 'user',
            content: 'Produce the JSON decision now. Do not include markdown or extra text.'
        });

        const hasResearch =
            !!state.researchResults &&
            (Array.isArray(state.researchResults)
                ? state.researchResults.length > 0
                : Object.keys(state.researchResults).length > 0);
        const fallbackNext = hasResearch ? 'coder' : 'researcher';

        const maxRetries = 2;
        let attempt = 0;
        let assistantMsg: ChatMessage | undefined;
        let decision: any | undefined;
        let workingMessages = [...baseMessages];

        while (attempt < maxRetries) {
            attempt += 1;
            log.info('Calling LLM for planning decision...', { attempt });
            const response = await chatFn(cfg, workingMessages, {
                model: cfg.modelFast,
                maxTokens: 512,
                response_format: { type: 'json_object' } as any
            });

            assistantMsg = response.messages[response.messages.length - 1];
            if (!assistantMsg?.content) {
                log.error('Planner received empty response from LLM', { attempt });
                if (attempt >= maxRetries) {
                    decision = {
                        next: fallbackNext,
                        reason: 'planner_empty_response_fallback',
                        profile: state.runProfile,
                        plan: []
                    };
                    break;
                }
                workingMessages = [
                    ...workingMessages,
                    {
                        role: 'user',
                        content: 'Previous reply was empty.## Verification\n- If `syntax_check` fails, this is a CRITICAL issue. Fix syntax errors (e.g. duplicate imports, unclosed brackets) immediately.\n- If tests fail, analyze the output.\n- If tests pass, verify against the goal.'
                    }
                ];
                continue;
            }

            try {
                decision = tryParseDecision(assistantMsg.content);
                log.info('Planner decision', {
                    next: decision.next,
                    reason: decision.reason,
                    profile: decision.profile
                });
                break;
            } catch (e) {
                log.error('Failed to parse planner JSON', {
                    error: e,
                    attempt,
                    contentPreview: assistantMsg.content.slice(0, 200)
                });
                if (attempt >= maxRetries) {
                    decision = {
                        next: fallbackNext,
                        reason: 'planner_parse_error_fallback',
                        profile: state.runProfile,
                        plan: [],
                        raw: assistantMsg.content.slice(0, 500)
                    };
                    break;
                }
                workingMessages = [
                    ...workingMessages,
                    assistantMsg,
                    {
                        role: 'user',
                        content: 'Your previous response was invalid JSON. Reply again with ONLY the JSON object that matches the schema.'
                    }
                ];
            }
        }

        if (!decision) {
            decision = {
                next: fallbackNext,
                reason: 'planner_unreachable_fallback',
                profile: state.runProfile,
                plan: []
            };
        }

        if (!assistantMsg) {
            // Should not happen, but guard to avoid undefined messages downstream
            assistantMsg = {
                role: 'assistant',
                content: JSON.stringify(decision)
            };
        }

        const isValidProfile = (p: any): p is ExecutionProfile =>
            p === 'strict' || p === 'fast' || p === 'smoke' || p === 'yolo';

        // Heuristic default profile based on architect SDD
        const architectText = state.sdd.architect || '';
        const strictSignals = [
            '--cov',
            'coverage',
            'mypy',
            'pylint',
            'black',
            'lint',
            'pre-commit'
        ];
        const hasStrictSignal = strictSignals.some(sig => architectText.includes(sig));
        const defaultProfile: ExecutionProfile = hasStrictSignal ? 'strict' : 'fast';

        // CLI/profile overrides from state take precedence over model guesses.
        const resolvedProfile: ExecutionProfile =
            (state.runProfile && isValidProfile(state.runProfile) ? state.runProfile : undefined) ||
            (isValidProfile(decision.profile) ? decision.profile : undefined) ||
            defaultProfile;

        // Update loop counters based on decision
        const nextNode = decision.next;

        if (nextNode === 'researcher') loopCounters.planner_to_researcher = (loopCounters.planner_to_researcher || 0) + 1;
        if (nextNode === 'verifier') loopCounters.planner_to_verifier = (loopCounters.planner_to_verifier || 0) + 1;
        if (nextNode === 'coder') loopCounters.planner_to_coder = (loopCounters.planner_to_coder || 0) + 1;

        // Enforce loop limits
        if (nextNode === 'researcher' && loopCounters.planner_to_researcher > MAX_LOOP_EDGE) {
            decision.next = 'snitch';
            decision.reason = `Planner detected loop planner→researcher without progress after ${loopCounters.planner_to_researcher} hops.`;
            return {
                terminalStatus: 'aborted_stuck',
                plan: decision,
                messages: [assistantMsg],
                runProfile: resolvedProfile,
                loopCounters,
                totalSteps: currentSteps
            };
        }
        if (nextNode === 'verifier' && loopCounters.planner_to_verifier > MAX_LOOP_EDGE) {
            decision.next = 'snitch';
            decision.reason = `Planner detected loop planner→verifier without progress after ${loopCounters.planner_to_verifier} hops.`;
            return {
                terminalStatus: 'aborted_stuck',
                plan: decision,
                messages: [assistantMsg],
                runProfile: resolvedProfile,
                loopCounters,
                totalSteps: currentSteps
            };
        }
        if (nextNode === 'coder' && loopCounters.planner_to_coder > MAX_LOOP_EDGE) {
            decision.next = 'snitch';
            decision.reason = `Planner detected loop planner→coder without progress after ${loopCounters.planner_to_coder} hops.`;
            return {
                terminalStatus: 'aborted_stuck',
                plan: decision,
                messages: [assistantMsg],
                runProfile: resolvedProfile,
                loopCounters,
                totalSteps: currentSteps
            };
        }

        // Research Quality Guardrails (Ticket 15)
        if (nextNode === 'researcher' && state.researchQuality) {
            const q = state.researchQuality;
            if (q.relevance < 0.3 && q.attemptCount >= 3) {
                log.warn('Research quality too low after max attempts, aborting research loop', { quality: q });
                decision.next = 'snitch';
                decision.reason = `Aborted: Research quality is too low (relevance ${q.relevance}) after ${q.attemptCount} attempts. Cannot proceed safely.`;
                return {
                    terminalStatus: 'aborted_stuck',
                    plan: decision,
                    messages: [assistantMsg],
                    runProfile: resolvedProfile,
                    loopCounters,
                    totalSteps: currentSteps
                };
            }
        }

        // Update state with the new plan/decision
        return {
            plan: decision,
            messages: [assistantMsg], // Append assistant's thought process
            runProfile: resolvedProfile,
            loopCounters,
            totalSteps: currentSteps,
            // Set terminal status if done
            ...(decision.next === 'done' ? { terminalStatus: decision.terminalStatus || 'done_success' } : {})
        };
    };
}
