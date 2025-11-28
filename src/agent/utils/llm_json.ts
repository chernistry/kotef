/**
 * LLM-aware JSON parsing utility.
 * Handles messy LLM output: markdown fences, truncation markers, prose, etc.
 * 
 * Inspired by hireex/nomorejobfuckery extraction patterns.
 */

import { jsonrepair } from 'jsonrepair';

export type LlmJsonErrorKind = 'parse-error' | 'truncated';

export interface LlmJsonError {
  kind: LlmJsonErrorKind;
  message: string;
  raw: string;
  sanitized: string;
}

export type LlmJsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: LlmJsonError };

export interface LlmJsonOptions {
  /**
   * If provided, uses a schema-aware extraction strategy that is more robust
   * against unescaped quotes in string values.
   */
  knownKeys?: string[];
}

const TRUNCATION_RE = /^[\s]*([⋮…⋯]+|\.{3,})[\s]*$/u;

// Global debug flag - can be set by config
let debugMode = false;

export function setLlmJsonDebug(enabled: boolean): void {
  debugMode = enabled;
}

function debugLog(stage: string, data: unknown): void {
  if (debugMode) {
    console.log(`[llm_json:${stage}]`, typeof data === 'string' ? data.slice(0, 500) : data);
  }
}

/**
 * Parse JSON from LLM output with sanitization and repair.
 */
export function parseLlmJson<T = unknown>(raw: string, options?: LlmJsonOptions): LlmJsonResult<T> {
  debugLog('input', raw);

  const candidate = extractJsonCandidate(raw);
  debugLog('candidate', candidate);

  // Strategy 0: Schema-aware parsing (if keys provided)
  // This is most robust for "messy" JSON where values might contain unescaped quotes
  if (options?.knownKeys && options.knownKeys.length > 0) {
    try {
      const value = schemaAwareParse(candidate, options.knownKeys) as T;
      debugLog('success', 'parsed via schema-aware strategy');
      return { ok: true, value };
    } catch (e) {
      debugLog('schema-aware-failed', e instanceof Error ? e.message : 'unknown');
      // Fall through to standard parsing
    }
  }

  const { sanitized, sawTruncation } = sanitize(candidate);
  debugLog('sanitized', sanitized);

  const repaired = repairCommonIssues(sanitized);
  debugLog('repaired', repaired);

  // Fast path
  try {
    const value = JSON.parse(repaired) as T;
    debugLog('success', 'parsed directly');
    return { ok: true, value };
  } catch (e1) {
    debugLog('direct-parse-failed', e1 instanceof Error ? e1.message : 'unknown');

    // Try jsonrepair library
    try {
      const fixed = jsonrepair(repaired);
      debugLog('jsonrepair-output', fixed);
      const value = JSON.parse(fixed) as T;
      debugLog('success', 'parsed after jsonrepair');
      return { ok: true, value };
    } catch (e2) {
      const errorMsg = e2 instanceof Error ? e2.message : 'JSON parse failed';
      debugLog('jsonrepair-failed', errorMsg);

      return {
        ok: false,
        error: {
          kind: sawTruncation ? 'truncated' : 'parse-error',
          message: errorMsg,
          raw,
          sanitized: repaired,
        },
      };
    }
  }
}

/**
 * Find the largest balanced {} block in the string.
 */
function extractLargestBraceBlock(s: string): string | null {
  let braceLevel = 0;
  let maxLen = 0;
  let bestMatch: string | null = null;
  let startIndex = -1;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    if (char === '{') {
      if (braceLevel === 0) startIndex = i;
      braceLevel++;
    } else if (char === '}') {
      if (braceLevel > 0) {
        braceLevel--;
        if (braceLevel === 0 && startIndex !== -1) {
          const len = i - startIndex + 1;
          if (len > maxLen) {
            maxLen = len;
            bestMatch = s.slice(startIndex, i + 1);
          }
        }
      }
    }
  }
  return bestMatch;
}

/**
 * Extract JSON candidate using brace-level tracking to find the LARGEST JSON object.
 * More robust than simple first/last brace matching.
 */
function extractJsonCandidate(raw: string): string {
  if (!raw) return '{}';

  const trimmed = raw.trim();

  // 1. If starts with { or [, prioritize brace tracking (JSON likely at top level)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const braceResult = extractLargestBraceBlock(trimmed);
    if (braceResult) {
      debugLog('extract', `found top-level JSON (${braceResult.length} chars)`);
      return braceResult;
    }
  }

  // 2. ```json ... ```
  const jsonFence = raw.match(/```json\s*([\s\S]*?)```/i);
  if (jsonFence?.[1]) {
    debugLog('extract', 'found json fence');
    return jsonFence[1].trim();
  }

  // 3. ``` ... ``` (only if content looks like JSON)
  const anyFence = raw.match(/```\s*([\s\S]*?)```/);
  if (anyFence?.[1]) {
    const content = anyFence[1].trim();
    if (content.startsWith('{') || content.startsWith('[')) {
      debugLog('extract', 'found generic fence with JSON');
      return content;
    }
  }

  // 4. Brace-level tracking fallback
  const braceResult = extractLargestBraceBlock(raw);
  if (braceResult) {
    debugLog('extract', `found largest object (${braceResult.length} chars)`);
    return braceResult;
  }

  // 5. Fallback: first [ to last ] for arrays
  const first = raw.indexOf('[');
  if (first !== -1) {
    const last = raw.lastIndexOf(']');
    if (last > first) {
      debugLog('extract', 'found array brackets');
      return raw.slice(first, last + 1);
    }
  }

  debugLog('extract', 'no JSON structure found, using raw');
  return raw.trim();
}

/**
 * Sanitize JSON candidate by removing LLM artifacts.
 */
function sanitize(s: string): { sanitized: string; sawTruncation: boolean } {
  let sawTruncation = false;

  // Remove BOM, zero-width, bidi chars
  s = s.replace(/^\uFEFF/, '');
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, '');

  // Process lines
  const lines = s.split(/\r?\n/).filter(line => {
    if (TRUNCATION_RE.test(line)) {
      sawTruncation = true;
      debugLog('sanitize', `removed truncation marker: ${line.trim()}`);
      return false;
    }
    if (line.trim() === '```') return false;
    if (/^here is (the )?json[:：]/i.test(line.trim())) return false;
    return true;
  });

  return { sanitized: lines.join('\n').trim() || '{}', sawTruncation };
}

/**
 * Repair common JSON issues from LLM output.
 * Based on patterns from hireex/nomorejobfuckery.
 */
function repairCommonIssues(s: string): string {
  // 1. Python constants → JSON
  s = s.replace(/\bTrue\b/g, 'true');
  s = s.replace(/\bFalse\b/g, 'false');
  s = s.replace(/\bNone\b/g, 'null');

  // 2. Trailing commas before } or ]
  s = s.replace(/,\s*([\}\]])/g, '$1');

  // 3. Single quotes → double quotes (for simple cases)
  // Key pattern: 'key': → "key":
  s = s.replace(/'([a-zA-Z_]\w*)'(\s*:)/g, '"$1"$2');

  // Value pattern: : 'value' → : "value" (simple strings without nested quotes)
  // CAUTION: This is risky for content containing code/markdown.
  // We only apply it if the value doesn't look like it contains quotes or newlines
  // s = s.replace(/:\s*'([^']*?)'/g, ': "$1"'); // DISABLED due to risk of mangling content

  // 4. Unquoted keys → quoted keys
  // Pattern: { key: or , key: → { "key": or , "key":
  s = s.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');

  // 5. Escape newlines inside strings (simplified)
  // Replace actual newlines between quotes with \n
  s = escapeNewlinesInStrings(s);

  return s;
}

/**
 * Escape newlines inside JSON string values.
 */
function escapeNewlinesInStrings(s: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of s) {
    if (!inString) {
      if (char === '"') inString = true;
      result.push(char);
    } else {
      if (escaped) {
        escaped = false;
        result.push(char);
      } else if (char === '\\') {
        escaped = true;
        result.push(char);
      } else if (char === '"') {
        inString = false;
        result.push(char);
      } else if (char === '\n' || char === '\r') {
        // Replace newlines with literal \n to preserve them in JSON string
        result.push('\\n');
      } else {
        result.push(char);
      }
    }
  }

  return result.join('');
}

/**
 * Schema-aware parsing strategy.
 * Uses known keys to slice the JSON string, avoiding ambiguity with unescaped quotes.
 */
function schemaAwareParse(json: string, knownKeys: string[]): any {
  // 1. Find positions of all known keys
  const keyPositions: { key: string; index: number }[] = [];
  for (const key of knownKeys) {
    // Look for "key": or "key" :
    const regex = new RegExp(`"${key}"\\s*:`, 'g');
    let match;
    while ((match = regex.exec(json)) !== null) {
      keyPositions.push({ key, index: match.index });
    }
  }

  // Sort by position
  keyPositions.sort((a, b) => a.index - b.index);

  if (keyPositions.length === 0) {
    throw new Error("No known keys found in input");
  }

  const result: any = {};

  for (let i = 0; i < keyPositions.length; i++) {
    const current = keyPositions[i];
    const next = keyPositions[i + 1];

    // Start of value is after the key and colon
    const keyMatchRegex = new RegExp(`"${current.key}"\\s*:`);
    const match = keyMatchRegex.exec(json.slice(current.index));
    if (!match) continue;

    const valueStartIndex = current.index + match[0].length;

    let valueEndIndex;
    if (next) {
      // End is before the next key.
      // Usually there is a comma before the next key.
      // We should look backwards from next.index to find the comma.
      const segment = json.slice(valueStartIndex, next.index);
      const lastComma = segment.lastIndexOf(',');
      if (lastComma !== -1) {
        valueEndIndex = valueStartIndex + lastComma;
      } else {
        valueEndIndex = next.index;
      }
    } else {
      // Last key. End is before the closing brace of the object.
      // We assume the object ends at the last }
      const lastBrace = json.lastIndexOf('}');
      if (lastBrace !== -1) {
        valueEndIndex = lastBrace;
      } else {
        valueEndIndex = json.length;
      }
    }

    let rawValue = json.slice(valueStartIndex, valueEndIndex).trim();

    // Sanitize the value
    // If it looks like a string (starts with "), we need to be careful
    if (rawValue.startsWith('"')) {
      // It's a string. It might have unescaped quotes inside.
      // We assume the *entire* content is the string.
      // Remove start/end quotes if present

      let content = rawValue;
      if (content.startsWith('"')) content = content.slice(1);
      if (content.endsWith('"')) content = content.slice(0, -1);

      // Now escape quotes and newlines in the content
      content = content.replace(/\\/g, '\\\\'); // Escape backslashes first
      content = content.replace(/"/g, '\\"');   // Escape quotes
      content = content.replace(/\n/g, '\\n');  // Escape newlines
      content = content.replace(/\r/g, '\\r');

      // Re-quote
      rawValue = `"${content}"`;
    }

    // Try to parse the value
    try {
      // Use jsonrepair on the value just in case
      // But for strings we just constructed a valid JSON string
      result[current.key] = JSON.parse(rawValue);
    } catch (e) {
      // Fallback: try jsonrepair on the raw value (useful for arrays/objects)
      try {
        const fixed = jsonrepair(rawValue);
        result[current.key] = JSON.parse(fixed);
      } catch (e2) {
        // Final fallback: just use the string
        result[current.key] = rawValue;
      }
    }
  }

  return result;
}
