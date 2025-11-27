import { jsonrepair } from 'jsonrepair';
import { createLogger } from '../core/logger.js';

const log = createLogger('utils:json');

/**
 * Safely parses JSON string, attempting to repair it if standard parse fails.
 * Useful for handling LLM outputs which may contain markdown fences or minor syntax errors.
 */
export function safeParse<T = any>(input: string | null | undefined, fallback?: T): T {
    if (!input) {
        if (fallback !== undefined) return fallback;
        throw new Error('JSON input is empty');
    }

    // 1. Try standard parse first (fastest)
    try {
        return JSON.parse(input);
    } catch (e) {
        // Continue to repair strategies
    }

    let cleaned = input.trim();

    // 2. Strip Markdown code fences if present
    // Matches ```json ... ``` or just ``` ... ```
    const fenceMatch = cleaned.match(/^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n```$/);
    if (fenceMatch && fenceMatch[1]) {
        cleaned = fenceMatch[1].trim();
        try {
            return JSON.parse(cleaned);
        } catch (e) {
            // Continue to repair
        }
    }

    // 3. Use jsonrepair to fix common LLM errors (missing quotes, trailing commas, etc.)
    try {
        const repaired = jsonrepair(cleaned);
        return JSON.parse(repaired);
    } catch (e: any) {
        log.warn('Failed to repair/parse JSON', { error: e.message, inputSnippet: input.slice(0, 100) });
        if (fallback !== undefined) return fallback;
        throw new Error(`Failed to parse JSON: ${e.message}`);
    }
}
