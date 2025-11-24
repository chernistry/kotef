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
    | 'verifier';

const RUNTIME_PROMPTS = new Set<RuntimePromptName>([
    'meta_agent',
    'planner',
    'researcher',
    'coder',
    'verifier'
]);

async function readPromptFile(promptName: string): Promise<string> {
    const promptsDir = path.resolve(__dirname, '../agent/prompts');
    const promptPath = path.join(promptsDir, `${promptName}.md`);

    try {
        const content = await fs.readFile(promptPath, 'utf8');
        if (!content.trim()) {
            throw new Error(`Prompt is empty: ${promptName} (${promptPath})`);
        }
        return content;
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new Error(`Prompt not found: ${promptName} (at ${promptPath})`);
        }
        throw error;
    }
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
