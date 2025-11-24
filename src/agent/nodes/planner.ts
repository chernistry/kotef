import { AgentState } from '../state.js';
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
        const replacements: Record<string, string> = {
            '{{GOAL}}': safe(state.sdd.goal),
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{SDD_PROJECT}}': safe(state.sdd.project),
            '{{SDD_ARCHITECT}}': safe(state.sdd.architect),
            '{{SDD_BEST_PRACTICES}}': safe(state.sdd.bestPractices),
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
            response_format: { type: 'json_object' } as any
        });

        const assistantMsg = response.messages[response.messages.length - 1];
        if (!assistantMsg.content) {
            throw new Error("Planner received empty response from LLM");
        }
        let decision: any = { next: 'researcher', reason: 'fallback' }; // Default fallback

        try {
            decision = JSON.parse(assistantMsg.content);
            log.info('Planner decision', { next: decision.next, reason: decision.reason });
        } catch (e) {
            log.error("Failed to parse planner JSON", { error: e });
        }

        // Update state with the new plan/decision
        return {
            plan: decision,
            messages: [assistantMsg] // Append assistant's thought process
        };
    };
}
