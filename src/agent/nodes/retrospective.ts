import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { callChat } from '../../core/llm.js';
import { loadPrompt } from '../../core/prompts.js';
import { createLogger } from '../../core/logger.js';
import { jsonrepair } from 'jsonrepair';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { appendRunSummary } from '../utils/project_memory.js';

const log = createLogger('retrospective');

interface Learning {
    category: 'success' | 'improvement';
    insight: string;
    confidence: 'high' | 'medium' | 'low';
}

interface RunMetrics {
    terminalStatus: string;
    totalSteps: number;
    loopCounters: {
        planner_to_researcher?: number;
        planner_to_verifier?: number;
        planner_to_coder?: number;
        planner_to_janitor?: number;
    };
    errorCount: number;
    fileChanges: number;
    timestamp: string;
}

export function retrospectiveNode(cfg: KotefConfig, chatFn: typeof callChat) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        log.info('Running retrospective analysis');

        try {
            // Collect metrics
            const metrics: RunMetrics = {
                terminalStatus: state.terminalStatus || 'unknown',
                totalSteps: state.totalSteps || 0,
                loopCounters: state.loopCounters || {},
                errorCount: state.failureHistory?.length || 0,
                fileChanges: Object.keys(state.fileChanges || {}).length,
                timestamp: new Date().toISOString()
            };

            // Log metrics to file
            await logMetrics(cfg.rootDir, metrics);

            // Ticket 04: Append to project memory
            const outcome = state.terminalStatus === 'done_success' ? 'success' :
                           state.terminalStatus === 'done_partial' ? 'partial' : 'failed';
            const lesson = state.failureHistory?.length
                ? `Had ${state.failureHistory.length} failures`
                : outcome === 'success' ? 'Completed without issues' : 'See learning_log.md';

            try {
                await appendRunSummary(cfg.rootDir, {
                    timestamp: new Date().toISOString(),
                    ticketId: state.sdd?.ticketId,
                    goal: (state.sdd?.goal || 'No goal').slice(0, 100),
                    outcome,
                    lesson
                });
                log.info('Appended run summary to project memory');
            } catch (e) {
                log.warn('Failed to append to project memory', { error: (e as Error).message });
            }

            // Skip learning analysis if no progress history
            if (!state.progressHistory || state.progressHistory.length === 0) {
                log.info('No progress history, skipping learning analysis');
                return {};
            }

            // Load prompt
            const promptTemplate = await loadPrompt('retrospective');

            // Prepare replacements
            const progressSummary = state.progressHistory
                .map((p, i) => `${i + 1}. Node: ${p.node}, Files: ${p.fileChangeCount}`)
                .join('\n');

            const testResultsSummary = state.testResults
                ? JSON.stringify(state.testResults, null, 2).slice(0, 500)
                : 'No test results';

            const diagnosticsSummary = state.diagnosticsSummary || 'No diagnostics';

            const prompt = promptTemplate
                .replace('{{TERMINAL_STATUS}}', state.terminalStatus || 'unknown')
                .replace('{{PROGRESS_HISTORY}}', progressSummary)
                .replace('{{LOOP_COUNTERS}}', JSON.stringify(state.loopCounters || {}, null, 2))
                .replace('{{GOAL}}', state.sdd?.goal || 'No goal specified')
                .replace('{{TEST_RESULTS}}', testResultsSummary)
                .replace('{{DIAGNOSTICS}}', diagnosticsSummary)
                .replace('{{FILE_CHANGES}}', metrics.fileChanges.toString());

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

            // Write to learning_log.md (safer than polluting best_practices.md)
            await appendLearnings(cfg.rootDir, highConfidence);

            return {};
        } catch (e) {
            log.error('Retrospective failed', { error: (e as Error).message });
            return {};
        }
    };
}

async function logMetrics(rootDir: string, metrics: RunMetrics): Promise<void> {
    const metricsDir = path.join(rootDir, '.sdd', 'metrics');

    try {
        await fs.mkdir(metricsDir, { recursive: true });
    } catch {
        // Directory might already exist
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `run-${timestamp}.json`;
    const metricsPath = path.join(metricsDir, filename);

    await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2), 'utf-8');
    log.info(`Logged metrics to ${filename}`);
}

async function appendLearnings(rootDir: string, learnings: Learning[]): Promise<void> {
    const sddDir = path.join(rootDir, '.sdd');
    const learningLogPath = path.join(sddDir, 'learning_log.md');

    let content = '';
    try {
        content = await fs.readFile(learningLogPath, 'utf-8');
    } catch {
        // File doesn't exist, create header
        content = '# Learning Log\n\nAutomated learnings from agent retrospectives.\n\n';
    }

    // Append learnings with timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    for (const learning of learnings) {
        const entry = `- **[${timestamp}]** (${learning.category}): ${learning.insight}\n`;
        content += entry;
    }

    await fs.writeFile(learningLogPath, content, 'utf-8');
    log.info(`Recorded ${learnings.length} learnings to learning_log.md`);
}
