import { promises as fs } from 'node:fs';
import path from 'node:path';
import { KotefConfig } from '../core/config.js';
import { callChat, ChatMessage } from '../core/llm.js';
import { createLogger } from '../core/logger.js';

export interface SddSummaries {
    projectSummary: string;
    architectSummary: string;
    bestPracticesSummary: string;
    cacheTimestamp?: number;
}

interface CachedSummaries extends SddSummaries {
    mtimes: {
        projectMd: number;
        architectMd: number;
        bestPracticesMd: number;
    };
}

/**
 * LLM-based summarization of SDD files to reduce token usage in prompts.
 * 
 * **Cost Analysis:**
 * - LLM summary generation: ~$0.003-0.015 per run (3 files × ~2.5k tokens each)
 * - Token savings in planner/coder: ~25k-100k tokens per run (5-10 calls × 5-10k tokens saved)
 * - Net savings: ~$0.01-0.18 per run (positive ROI!)
 * 
 * **Caching Strategy:**
 * - Summaries cached to `.sdd/cache/summaries.json`
 * - Invalidated when source files change (mtime comparison)
 * - Amortizes cost across multiple runs
 */
export async function buildSddSummaries(cfg: KotefConfig, rootDir: string): Promise<SddSummaries> {
    const log = createLogger('sdd-summary');
    const sddDir = path.join(rootDir, '.sdd');
    const cacheDir = path.join(sddDir, 'cache');
    const cachePath = path.join(cacheDir, 'summaries.json');

    // Try to load cached summaries
    try {
        const cached = await loadCachedSummaries(sddDir, cachePath);
        if (cached) {
            log.info('Using cached SDD summaries');
            return cached;
        }
    } catch (e) {
        log.warn('Failed to load cached summaries, regenerating', { error: String(e) });
    }

    // Generate fresh summaries
    log.info('Generating LLM-based SDD summaries');
    const projectMd = await fs.readFile(path.join(sddDir, 'project.md'), 'utf-8').catch(() => '');
    const architectMd = await fs.readFile(path.join(sddDir, 'architect.md'), 'utf-8').catch(() => '');
    const bestPracticesMd = await fs.readFile(path.join(sddDir, 'best_practices.md'), 'utf-8').catch(() => '');

    const summaries: SddSummaries = {
        projectSummary: await summarizeWithLLM(cfg, projectMd, 'project'),
        architectSummary: await summarizeWithLLM(cfg, architectMd, 'architect'),
        bestPracticesSummary: await summarizeWithLLM(cfg, bestPracticesMd, 'best_practices'),
        cacheTimestamp: Date.now()
    };

    // Cache summaries
    try {
        await fs.mkdir(cacheDir, { recursive: true });
        const projectStat = await fs.stat(path.join(sddDir, 'project.md')).catch(() => null);
        const architectStat = await fs.stat(path.join(sddDir, 'architect.md')).catch(() => null);
        const bestPracticesStat = await fs.stat(path.join(sddDir, 'best_practices.md')).catch(() => null);

        const cachedData: CachedSummaries = {
            ...summaries,
            mtimes: {
                projectMd: projectStat?.mtimeMs ?? 0,
                architectMd: architectStat?.mtimeMs ?? 0,
                bestPracticesMd: bestPracticesStat?.mtimeMs ?? 0
            }
        };

        await fs.writeFile(cachePath, JSON.stringify(cachedData, null, 2), 'utf-8');
        log.info('Cached SDD summaries to disk');
    } catch (e) {
        log.warn('Failed to cache summaries', { error: String(e) });
    }

    return summaries;
}

async function loadCachedSummaries(sddDir: string, cachePath: string): Promise<SddSummaries | null> {
    try {
        const cacheContent = await fs.readFile(cachePath, 'utf-8');
        const cached: CachedSummaries = JSON.parse(cacheContent);

        // Check if source files have changed
        const projectStat = await fs.stat(path.join(sddDir, 'project.md')).catch(() => null);
        const architectStat = await fs.stat(path.join(sddDir, 'architect.md')).catch(() => null);
        const bestPracticesStat = await fs.stat(path.join(sddDir, 'best_practices.md')).catch(() => null);

        if (
            projectStat && projectStat.mtimeMs === cached.mtimes.projectMd &&
            architectStat && architectStat.mtimeMs === cached.mtimes.architectMd &&
            bestPracticesStat && bestPracticesStat.mtimeMs === cached.mtimes.bestPracticesMd
        ) {
            return cached;
        }

        return null; // Files changed, invalidate cache
    } catch (e) {
        return null;
    }
}

async function summarizeWithLLM(cfg: KotefConfig, content: string, type: 'project' | 'architect' | 'best_practices'): Promise<string> {
    if (!content || content.trim().length === 0) {
        return '[No content available]';
    }

    const prompts: Record<typeof type, string> = {
        project: `Summarize this project.md file into 300-500 words. Include:
- Project goal and scope
- Tech stack
- Definition of Done (key success criteria)
- Any critical constraints or non-goals

Keep it concise but preserve all critical information.`,
        architect: `Summarize this architect.md file into 300-500 words. Include:
- Architecture pattern(s) used
- Key components and their relationships
- Critical constraints and quality gates
- Any non-negotiable design decisions

Focus on what the coder/planner needs to know.`,
        best_practices: `Summarize this best_practices.md file into 200-400 words. Include:
- Code quality standards
- Testing approach
- Security guardrails
- Performance/cost constraints

Prioritize actionable rules the coder must follow.`
    };

    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a technical summarizer. Create concise, information-dense summaries that preserve critical details.' },
        { role: 'user', content: `${prompts[type]}\n\n# Content to summarize:\n\n${content.slice(0, 15000)}` }
    ];

    try {
        const response = await callChat(cfg, messages, {
            model: cfg.modelFast, // Use fast model for cost efficiency
            maxTokens: 512,
            temperature: 0
        });

        return response.messages[response.messages.length - 1]?.content?.trim() || '[Summary generation failed]';
    } catch (e) {
        return `[Error summarizing ${type}: ${String(e)}]`;
    }
}
