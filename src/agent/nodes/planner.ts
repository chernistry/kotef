import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { ChatMessage } from '../../core/llm.js';
import { loadPrompt } from '../../core/prompts.js';

export function plannerNode(_cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const promptTemplate = await loadPrompt('meta_agent');

        // Simple template substitution
        const systemPrompt = promptTemplate
            .replace('{{project}}', state.sdd.project)
            .replace('{{architect}}', state.sdd.architect)
            .replace('{{bestPractices}}', state.sdd.bestPractices || 'None')
            .replace('{{ticket}}', state.sdd.ticket || 'None');

        const _messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...state.messages
        ];

        // For MVP, the planner just decides the next step by outputting a thought.
        // In a real implementation, it would output a structured plan.
        // Here we just let the LLM generate a response which might include tool calls (if we attached tools to planner).
        // But per design, Planner -> Router -> Specific Node.
        // Let's assume the Planner outputs a JSON decision or just text that the Router parses.
        // For this MVP step, let's keep it simple: Planner is the entry point that might just pass through or add context.

        // Actually, looking at the graph design: Planner -> Router.
        // The Planner should probably analyze the state and decide what to do.

        // Let's make the Planner output a "Plan" object into the state.

        return {
            plan: { next: 'researcher' } // Stub: always go to researcher first for now, or logic to decide.
        };
    };
}
