import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const promptCache = new Map<string, string>();

export type RuntimePromptName =
    | 'meta_agent'
    | 'planner'
    | 'researcher'
    | 'coder'
    | 'verifier'
    | 'snitch'
    | 'research_query_refiner'
    | 'research_relevance_evaluator'
    | 'search_query_optimizer'
    | 'kiro_coder'
    | 'orchestrator_tickets'
    | 'sdd_summary_project'
    | 'sdd_summary_architect'
    | 'sdd_summary_best_practices';

const RUNTIME_PROMPTS = new Set<RuntimePromptName>([
    'meta_agent',
    'planner',
    'researcher',
    'coder',
    'verifier',
    'snitch',
    'research_query_refiner',
    'research_relevance_evaluator',
    'search_query_optimizer',
    'kiro_coder',
    'orchestrator_tickets',
    'sdd_summary_project',
    'sdd_summary_architect',
    'sdd_summary_best_practices'
]);

async function readPromptFile(promptName: string): Promise<string> {
    const promptsRoot = path.resolve(__dirname, '../agent/prompts');

    // New layout: prompts are grouped under body/ (runtime agent) and brain/ (SDD templates).
    // Keep a fallback to the root for backwards-compatibility / incremental migrations.
    const candidatePaths = [
        path.join(promptsRoot, 'body', `${promptName}.md`),
        path.join(promptsRoot, 'brain', `${promptName}.md`),
        path.join(promptsRoot, `${promptName}.md`)
    ];

    let lastError: any;

    for (const promptPath of candidatePaths) {
        try {
            const content = await fs.readFile(promptPath, 'utf8');
            if (!content.trim()) {
                throw new Error(`Prompt is empty: ${promptName} (${promptPath})`);
            }
            return content;
        } catch (error: any) {
            lastError = error;
            if (error.code === 'ENOENT') {
                // Try next candidate.
                continue;
            }
            // For non-ENOENT errors, surface immediately.
            throw error;
        }
    }

    if (lastError?.code === 'ENOENT') {
        throw new Error(`Prompt not found: ${promptName} (searched under ${promptsRoot})`);
    }
    throw lastError || new Error(`Prompt not found: ${promptName} (no candidates matched)`);
}

/**
 * Generic prompt loader. Use loadRuntimePrompt for runtime agent prompts.
 */
export async function loadPrompt(promptName: string): Promise<string> {
    if (promptCache.has(promptName)) {
        return promptCache.get(promptName)!;
    }
    const content = await readPromptFile(promptName);
    promptCache.set(promptName, content);
    return content;
}

export const loadRuntimePrompt = async (name: RuntimePromptName): Promise<string> => {
    if (!RUNTIME_PROMPTS.has(name)) {
        throw new Error(`Unknown runtime prompt: ${name}`);
    }
    return loadPrompt(name);
};

export function clearPromptCache() {
    promptCache.clear();
}
