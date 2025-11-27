import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { callChat } from '../../core/llm.js';
import { loadPrompt } from '../../core/prompts.js';
import { createLogger } from '../../core/logger.js';
import { jsonrepair } from 'jsonrepair';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const log = createLogger('retrospective');

interface Learning {
    category: 'success' | 'improvement';
    insight: string;
    confidence: 'high' | 'medium' | 'low';
}

export function retrospectiveNode(cfg: KotefConfig, chatFn: typeof callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        log.info('Running retrospective analysis');

        // Skip if no progress history
        if (!state.progressHistory || state.progressHistory.length === 0) {
            log.info('No progress history, skipping retrospective');
            return {};
        }

        try {
            // Load prompt
            const promptTemplate = await loadPrompt('retrospective');

            // Prepare replacements
            const progressSummary = state.progressHistory
                .map((p, i) => `${i + 1}. Node: ${p.node}, Files: ${p.fileChangeCount}`)
                .join('\n');

            const prompt = promptTemplate
                .replace('{{TERMINAL_STATUS}}', state.terminalStatus || 'unknown')
                .replace('{{PROGRESS_HISTORY}}', progressSummary)
                .replace('{{LOOP_COUNTERS}}', JSON.stringify(state.loopCounters || {}, null, 2));

            // Call LLM
            const response = await chatFn(cfg, [
                { role: 'system', content: 'You are an expert at analyzing agent performance.' },
                { role: 'user', content: prompt }
            ], {
                model: cfg.modelFast,
                temperature: 0,
                maxTokens: 500,
                response_format: { type: 'json_object' }
            });

            const content = response.messages[response.messages.length - 1].content || '{}';

            // Parse JSON
            let learnings: Learning[] = [];
            try {
                const parsed = JSON.parse(content);
                learnings = parsed.learnings || [];
            } catch {
                // Try jsonrepair
                try {
                    const repaired = jsonrepair(content);
                    const parsed = JSON.parse(repaired);
                    learnings = parsed.learnings || [];
                } catch (e) {
                    log.error('Failed to parse retrospective output', { error: (e as Error).message });
                }
            }

            // Filter for high-confidence learnings
            const highConfidence = learnings.filter(l => l.confidence === 'high');

            if (highConfidence.length === 0) {
                log.info('No high-confidence learnings to record');
                return {};
            }

            // Append to best_practices.md
            const sddDir = path.join(cfg.rootDir, '.sdd');
            const bestPracticesPath = path.join(sddDir, 'best_practices.md');

            let content_bp = '';
            try {
                content_bp = await fs.readFile(bestPracticesPath, 'utf-8');
            } catch {
                // File doesn't exist, create header
                content_bp = '# Best Practices\n\n';
            }

            // Check if "Automated Learnings" section exists
            if (!content_bp.includes('## Automated Learnings')) {
                content_bp += '\n## Automated Learnings\n\n';
            }

            // Append learnings
            const timestamp = new Date().toISOString().split('T')[0];
            for (const learning of highConfidence) {
                const entry = `- **[${timestamp}]** (${learning.category}): ${learning.insight}\n`;
                content_bp += entry;
            }

            await fs.writeFile(bestPracticesPath, content_bp, 'utf-8');
            log.info(`Recorded ${highConfidence.length} learnings to best_practices.md`);

            return {};
        } catch (e) {
            log.error('Retrospective failed', { error: (e as Error).message });
            return {};
        }
    };
}
