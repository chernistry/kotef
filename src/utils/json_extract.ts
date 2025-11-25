/**
 * JSON extraction utilities
 * Based on mem0 library with enhancements for robustness
 */

/**
 * Extracts JSON content from a string that may contain:
 * - Triple backticks with optional 'json' language tag
 * - Markdown code blocks
 * - Raw JSON
 * 
 * @param text - Input text that may contain JSON
 * @returns Extracted JSON string (still needs to be parsed)
 */
export function extractJson(text: string): string {
    text = text.trim();

    // Strategy 1: Try to find JSON in code blocks (```json ... ``` or ```...```)
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        return codeBlockMatch[1].trim();
    }

    // Strategy 2: Remove leading/trailing text and try to find JSON object/array
    const jsonObjectMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonObjectMatch) {
        return jsonObjectMatch[1].trim();
    }

    // Strategy 3: Return as-is (assume it's raw JSON)
    return text;
}

/**
 * Attempts to parse JSON with multiple fallback strategies
 * 
 * @param text - Input text that may contain JSON
 * @returns Parsed JSON object or null if parsing fails
 */
export function parseExtractedJson<T = any>(text: string): T | null {
    try {
        const extracted = extractJson(text);
        return JSON.parse(extracted) as T;
    } catch (error) {
        // If extraction + parsing failed, try parsing original text directly
        try {
            return JSON.parse(text) as T;
        } catch {
            return null;
        }
    }
}

/**
 * Safe JSON parsing with default fallback
 * 
 * @param text - Input text containing JSON
 * @param defaultValue - Value to return if parsing fails
 * @returns Parsed JSON or default value
 */
export function safeParseJson<T = any>(text: string, defaultValue: T): T {
    const parsed = parseExtractedJson<T>(text);
    return parsed !== null ? parsed : defaultValue;
}
