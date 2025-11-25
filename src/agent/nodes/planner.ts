import { AgentState, ExecutionProfile } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { ChatMessage, callChat } from '../../core/llm.js';
import { loadRuntimePrompt } from '../../core/prompts.js';
import { createLogger } from '../../core/logger.js';
import { jsonrepair } from 'jsonrepair';

export function plannerNode(cfg: KotefConfig, chatFn = callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('planner');
        log.info('Planner node started');

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
        const replacements: Record<string, string> = {
            '{{GOAL}}': safe(state.sdd.goal),
            '{{TICKET}}': safe(state.sdd.ticket),
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
        };

        // Flow Control & Stop Rules (Ticket 14)
        const MAX_STEPS = 50;
        const MAX_LOOP_EDGE = 5;
        const currentSteps = (state.totalSteps || 0) + 1;

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
                        content: 'Previous reply was empty. Respond with a valid JSON object as per schema.'
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
        const loopCounters = { ...state.loopCounters };

        if (nextNode === 'researcher') loopCounters.planner_to_researcher = (loopCounters.planner_to_researcher || 0) + 1;
        if (nextNode === 'verifier') loopCounters.planner_to_verifier = (loopCounters.planner_to_verifier || 0) + 1;
        if (nextNode === 'coder') loopCounters.planner_to_coder = (loopCounters.planner_to_coder || 0) + 1;

        // Enforce loop limits
        if (nextNode === 'researcher' && loopCounters.planner_to_researcher > MAX_LOOP_EDGE) {
            decision.next = 'snitch';
            decision.reason = `Aborted: Planner->Researcher loop limit exceeded (${MAX_LOOP_EDGE}).`;
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
            decision.reason = `Aborted: Planner->Verifier loop limit exceeded (${MAX_LOOP_EDGE}).`;
            return {
                terminalStatus: 'aborted_stuck',
                plan: decision,
                messages: [assistantMsg],
                runProfile: resolvedProfile,
                loopCounters,
                totalSteps: currentSteps
            };
        }

        // Update state with the new plan/decision
        return {
            plan: decision,
            messages: [assistantMsg], // Append assistant's thought process
            runProfile: resolvedProfile,
            loopCounters,
            totalSteps: currentSteps,
            // Set terminal status if done
            ...(decision.next === 'done' ? { terminalStatus: 'done_success' } : {})
        };
    };
}
