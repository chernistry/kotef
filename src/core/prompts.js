import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Loads a markdown prompt from src/agent/prompts/
 */
export async function loadPrompt(promptName) {
    // We assume prompts are in ../agent/prompts relative to this file (src/core/prompts.ts)
    // So src/core/../agent/prompts -> src/agent/prompts
    const promptsDir = path.resolve(__dirname, '../agent/prompts');
    const promptPath = path.join(promptsDir, `${promptName}.md`);
    try {
        return await fs.readFile(promptPath, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Prompt not found: ${promptName} (at ${promptPath})`);
        }
        throw error;
    }
}
