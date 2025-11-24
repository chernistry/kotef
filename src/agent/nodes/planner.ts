import { AgentState, ExecutionProfile } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { ChatMessage, callChat } from '../../core/llm.js';
import { loadRuntimePrompt } from '../../core/prompts.js';
import { createLogger } from '../../core/logger.js';

export function plannerNode(cfg: KotefConfig, chatFn = callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('planner');
        log.info('Planner node started');
        
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
            '{{SDD_PROJECT}}': summarize(state.sdd.project, 4000),
            '{{SDD_ARCHITECT}}': summarize(state.sdd.architect, 4000),
            '{{SDD_BEST_PRACTICES}}': summarize(state.sdd.bestPractices, 4000),
            '{{STATE_PLAN}}': safe(state.plan),
            '{{RESEARCH_RESULTS}}': safe(state.researchResults),
            '{{FILE_CHANGES}}': safe(state.fileChanges),
            '{{TEST_RESULTS}}': safe(state.testResults),
        };

        let systemPrompt = promptTemplate;
        for (const [token, value] of Object.entries(replacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
        }

        // Add recent history to context
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...state.messages
        ];

        messages.push({
            role: 'user',
            content: 'Produce the JSON decision now. Do not include markdown or extra text.'
        });

        log.info('Calling LLM for planning decision...');
        const response = await chatFn(cfg, messages, {
            model: cfg.modelFast, // Planner uses fast/cheap model
            // Planner JSON should be compact; keep completion small to reduce latency.
            maxTokens: 800,
            response_format: { type: 'json_object' } as any
        });

        const assistantMsg = response.messages[response.messages.length - 1];
        if (!assistantMsg.content) {
            throw new Error("Planner received empty response from LLM");
        }
        let decision: any = { next: 'researcher', reason: 'fallback' }; // Default fallback

        try {
            decision = JSON.parse(assistantMsg.content);
            log.info('Planner decision', {
                next: decision.next,
                reason: decision.reason,
                profile: decision.profile
            });
        } catch (e) {
            log.error("Failed to parse planner JSON", { error: e });
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

        const resolvedProfile: ExecutionProfile =
            (isValidProfile(decision.profile) ? decision.profile : undefined) ||
            state.runProfile ||
            defaultProfile;

        // Update state with the new plan/decision
        return {
            plan: decision,
            messages: [assistantMsg], // Append assistant's thought process
            runProfile: resolvedProfile
        };
    };
}
