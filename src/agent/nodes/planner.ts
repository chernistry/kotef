import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { ChatMessage, callChat } from '../../core/llm.js';
import { loadPrompt } from '../../core/prompts.js';

export function plannerNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const promptTemplate = await loadPrompt('meta_agent');

        const systemPrompt = promptTemplate
            .replace('{{project}}', state.sdd.project)
            .replace('{{architect}}', state.sdd.architect)
            .replace('{{bestPractices}}', state.sdd.bestPractices || 'None')
            .replace('{{ticket}}', state.sdd.ticket || 'None');

        // Add recent history to context
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...state.messages
        ];

        // Call LLM
        // We expect the planner to output a JSON plan or a decision.
        // For this MVP, let's ask for a JSON response with "next" field.
        // We can append a user message forcing this format if not in system prompt.
        messages.push({
            role: 'user',
            content: `Analyze the current state. 
      If research is needed, reply with {"next": "researcher", "reason": "..."}.
      If ready to code, reply with {"next": "coder", "reason": "..."}.
      If ready to verify, reply with {"next": "verifier", "reason": "..."}.
      If done, reply with {"next": "done", "reason": "..."}.
      
      Current Plan: ${JSON.stringify(state.plan || {})}
      Research Results: ${JSON.stringify(state.researchResults || {})}
      File Changes: ${JSON.stringify(state.fileChanges || {})}
      Test Results: ${JSON.stringify(state.testResults || {})}`
        });

        const response = await callChat(cfg, messages, {
            model: cfg.modelFast, // Planner uses fast model
            response_format: { type: 'json_object' }
        });

        const assistantMsg = response.messages[response.messages.length - 1];
        let decision: any = { next: 'researcher' }; // Default fallback

        try {
            decision = JSON.parse(assistantMsg.content);
        } catch (e) {
            console.error("Failed to parse planner JSON:", e);
        }

        // Update state with the new plan/decision
        return {
            plan: decision,
            messages: [assistantMsg] // Append assistant's thought process
        };
    };
}
