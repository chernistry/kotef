import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { ChatMessage, callChat } from '../../core/llm.js';
import { loadRuntimePrompt } from '../../core/prompts.js';
import { createLogger } from '../../core/logger.js';
import { jsonrepair } from 'jsonrepair';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export function janitorNode(cfg: KotefConfig, chatFn = callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('janitor');
        log.info('Janitor node started');

        const promptTemplate = await loadRuntimePrompt('janitor');

        // Prepare context
        const safe = (value: unknown) => {
            if (value === undefined || value === null) return '';
            if (typeof value === 'string') return value;
            return JSON.stringify(value, null, 2);
        };

        const promptReplacements: Record<string, string> = {
            '{{GOAL}}': safe(state.sdd.goal),
            '{{TICKET}}': safe(state.sdd.ticket),
            '{{ISSUES}}': safe(state.sdd.issues || 'No issues recorded.'),
            '{{DIAGNOSTICS}}': (await import('../utils/diagnostics.js')).summarizeDiagnostics(state.diagnosticsLog),
            '{{FILE_CHANGES}}': safe(state.fileChanges),
            '{{TEST_RESULTS}}': safe(state.testResults),
        };

        let systemPrompt = promptTemplate;
        for (const [token, value] of Object.entries(promptReplacements)) {
            systemPrompt = systemPrompt.replaceAll(token, value);
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...state.messages,
            { role: 'user', content: 'Analyze the current state and produce a JSON decision for cleanup or tech debt creation.' }
        ];

        try {
            const response = await chatFn(cfg, messages, {
                model: cfg.modelFast,
                maxTokens: 1024,
                response_format: { type: 'json_object' } as any
            });

            const assistantMsg = response.messages[response.messages.length - 1];
            if (!assistantMsg?.content) {
                throw new Error('Empty response from Janitor');
            }

            let decision;
            try {
                decision = JSON.parse(assistantMsg.content);
            } catch (e) {
                decision = JSON.parse(jsonrepair(assistantMsg.content));
            }

            log.info('Janitor decision', { decision });

            // Execute actions
            if (decision.actions) {
                for (const action of decision.actions) {
                    if (action.type === 'create_ticket') {
                        const ticketId = action.ticket_id || `TD-${Date.now()}`;
                        const ticketSlug = action.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                        const filename = `${ticketId}-${ticketSlug}.md`;
                        const ticketPath = path.join(cfg.rootDir, '.sdd', 'backlog', 'tickets', 'open', filename);

                        const ticketContent = `# Ticket: ${action.title}\n\n` +
                            `Spec version: v1.0\n` +
                            `Context: Tech Debt created by Janitor\n\n` +
                            `## Objective & DoD\n${action.description}\n\n` +
                            `## Steps\n${action.steps || 'To be defined'}\n\n` +
                            `## Affected Files\n${action.affected_files || 'To be determined'}\n`;

                        await fs.writeFile(ticketPath, ticketContent, 'utf-8');
                        log.info('Created tech debt ticket', { ticketPath });
                    }
                    // Future: handle 'refactor' actions (apply patches)
                }
            }

            return {
                messages: [assistantMsg],
                // Janitor usually finishes the run (goes to ticket_closer or end)
                // But we let the graph edge decide based on 'next'
                plan: {
                    ...state.plan,
                    next: decision.next || 'done'
                }
            };

        } catch (err) {
            log.error('Janitor failed', { error: (err as Error).message });
            // Fallback: just finish
            return {
                plan: {
                    ...state.plan,
                    next: 'done'
                }
            };
        }
    };
}
