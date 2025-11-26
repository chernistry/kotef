import { AgentState, ExecutionProfile, TaskScope, BudgetState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { ChatMessage, callChat } from '../../core/llm.js';
import { loadRuntimePrompt } from '../../core/prompts.js';
import { createLogger } from '../../core/logger.js';
import { jsonrepair } from 'jsonrepair';
import { buildProjectSummary } from '../utils/project_summary.js';
import { deriveFunctionalStatus } from '../utils/functional_checks.js';
import { makeSnapshot, assessProgress } from '../utils/progress_controller.js';
import { transitionPhase } from '../utils/phase_tracker.js';
import { getHotspots } from '../../tools/git.js';

import path from 'node:path';
import { promises as fs } from 'node:fs';

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

            // Initialize git hotspots if not present (Ticket 54)
            if (!state.gitHotspots && cfg.gitEnabled && !cfg.dryRun) {
                try {
                    state.gitHotspots = await getHotspots(cfg.rootDir || process.cwd(), { limit: 5 });
                    log.info('Git hotspots loaded', { hotspots: state.gitHotspots });
                } catch (err) {
                    log.warn('Failed to load git hotspots', { error: (err as Error).message });
                }
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
                done: true, // Snitch will handle logging
                progressHistory
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
                done: true,
                progressHistory
            };
        }

        // Ticket 51: Read Risk Register
        let riskSummary = 'No known risks.';
        try {
            const riskFile = path.join(cfg.rootDir, '.sdd', 'risk_register.md');
            const riskContent = await fs.readFile(riskFile, 'utf-8');
            // Simple heuristic: extract open High/Medium risks
            const lines = riskContent.split('\n').filter(l => l.startsWith('| R-'));
            const openRisks = lines.filter(l => l.includes('| open |') && (l.includes('| high |') || l.includes('| medium |')));
            if (openRisks.length > 0) {
                riskSummary = openRisks.map(l => {
                    const parts = l.split('|').map(p => p.trim());
                    // | ID | Area | Type | Severity | Status | Description | ...
                    // parts[0] is empty, parts[1] is ID, etc.
                    return `- [${parts[4].toUpperCase()}] ${parts[2]} (${parts[6]}): ${parts[3]}`; // Severity Area: Description
                }).join('\n');
            }
        } catch (e) {
            // Ignore if missing
        }

        const plannerPromptTemplate = await loadRuntimePrompt('planner');
        const promptReplacements: Record<string, string> = {
            '{{PROJECT_SUMMARY}}': state.sddSummaries?.projectSummary || state.sdd.project || 'No project summary available.',
            '{{ARCHITECT_SUMMARY}}': state.sddSummaries?.architectSummary || state.sdd.architect || 'No architecture summary available.',
            '{{BEST_PRACTICES_SUMMARY}}': state.sddSummaries?.bestPracticesSummary || state.sdd.bestPractices || 'No best practices available.',
            '{{RISK_REGISTER_SUMMARY}}': riskSummary,
            '{{FLOW_METRICS_SUMMARY}}': await loadFlowMetricsSummary(cfg.rootDir),
            '{{GIT_HOTSPOTS}}': formatHotspots(state.gitHotspots)
        };

        let systemPrompt = plannerPromptTemplate;
        for (const [token, value] of Object.entries(promptReplacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
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
                totalSteps: currentSteps,
                progressHistory
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
                totalSteps: currentSteps,
                progressHistory
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
                totalSteps: currentSteps,
                progressHistory
            };
        }

        // Research Quality Guardrails (Ticket 15 & 52)
        // Check if we should block progress based on research quality
        if ((nextNode === 'researcher' || nextNode === 'coder') && state.researchQuality) {
            const q = state.researchQuality;
            const isStrict = state.runProfile === 'strict';

            // Ticket 52: Strict profile gating
            if (isStrict) {
                const lowSupport = (q.support !== undefined && q.support < 0.7);
                const lowRecency = (q.recency !== undefined && q.recency < 0.6);
                const hasConflicts = q.hasConflicts === true;

                if (lowSupport || lowRecency || hasConflicts) {
                    log.warn('Research quality insufficient for strict profile', { quality: q, nextNode });
                    decision.next = 'snitch';
                    decision.reason = `Aborted (Strict Mode): Research quality insufficient for ${nextNode}. Support=${q.support}, Recency=${q.recency}, Conflicts=${q.hasConflicts}. Requires human review or manual overrides.`;
                    return {
                        terminalStatus: 'aborted_constraint',
                        plan: decision,
                        messages: [assistantMsg],
                        runProfile: resolvedProfile,
                        loopCounters,
                        totalSteps: currentSteps,
                        progressHistory
                    };
                }
            }

            // General low-quality abort (only for research loops)
            if (nextNode === 'researcher' && q.relevance < 0.3 && q.attemptCount >= 3) {
                log.warn('Research quality too low after max attempts, aborting research loop', { quality: q });
                decision.next = 'snitch';
                decision.reason = `Aborted: Research quality is too low (relevance ${q.relevance}) after ${q.attemptCount} attempts. Cannot proceed safely.`;
                return {
                    terminalStatus: 'aborted_stuck',
                    plan: decision,
                    messages: [assistantMsg],
                    runProfile: resolvedProfile,
                    loopCounters,
                    totalSteps: currentSteps,
                    progressHistory
                };
            }
        }

        // Update state with the new plan/decision
        // Ticket 56: Phase Tracking
        // Map next node to phase
        let nextPhase: import('../state.js').AgentPhase | undefined;
        if (decision.next === 'researcher') nextPhase = 'analyze_system_state';
        else if (decision.next === 'coder') nextPhase = 'implement';
        else if (decision.next === 'verifier') nextPhase = 'verify';
        else if (decision.next === 'done') nextPhase = 'retro';
        else if (decision.next === 'snitch') nextPhase = 'retro'; // Snitch usually ends or pauses, treat as retro/stop

        // If we are staying in planner (e.g. loop), we might be in 'plan_work' or 'design_decide'
        // But plannerNode returns the *next* step.
        // The *current* execution of plannerNode could be considered 'plan_work'.
        // However, we want to set the phase for the *next* iteration or the tool call.

        let phaseUpdates = {};
        if (nextPhase) {
            phaseUpdates = transitionPhase(state, nextPhase, decision.reason);
        } else {
            // Default to 'plan_work' if we are looping back to planner or unknown
            // But wait, planner returns a partial state that *will be applied*.
            // So if we set currentPhase here, it applies to the state *after* planner.
            // If next is 'researcher', state.currentPhase becomes 'analyze_system_state'. Correct.
        }

        // Special case: Initial phase
        if (!state.currentPhase) {
            // If we are here, we are planning. But we missed the 'understand_goal' phase?
            // We can retroactively add it or just start here.
            // Let's assume the very first planner run transitions FROM understand_goal TO plan_work.
            // But we are returning the *result* of planning.
        }

        return {
            plan: decision,
            messages: [assistantMsg], // Append assistant's thought process
            runProfile: resolvedProfile,
            loopCounters,
            totalSteps: currentSteps,
            progressHistory,
            // Set terminal status if done
            ...(decision.next === 'done' ? { terminalStatus: decision.terminalStatus || 'done_success' } : {}),
            // Ticket 50: Pass through ADRs and assumptions
            designDecisions: decision.designDecisions,
            assumptions: decision.assumptions,
            ...phaseUpdates
        };
    };
}

async function loadFlowMetricsSummary(rootDir: string): Promise<string> {
    try {
        const cacheFile = path.join(rootDir, '.sdd', 'cache', 'flow_metrics.json');
        const content = await fs.readFile(cacheFile, 'utf-8');
        const m = JSON.parse(content);
        return `
- Success Rate: ${(m.successRate * 100).toFixed(1)}%
- Avg Duration: ${m.averageDurationSeconds.toFixed(1)}s
- Avg Change Size: ${m.averageChangeSize.toFixed(1)} files
- Recent Trend: ${m.recentTrend}
- Top Failures: ${Object.entries(m.failureModes).map(([k, v]) => `${k} (${v})`).join(', ')}
`.trim();
    } catch (e) {
        return 'No flow metrics available.';
    }
}

function formatHotspots(hotspots?: import('../../tools/git.js').GitHotspot[]): string {
    if (!hotspots || hotspots.length === 0) return 'None detected.';
    return hotspots.map(h => `- ${h.file} (${h.commits} commits, last: ${h.lastCommitDate})`).join('\n');
}
