/**
 * LLM-aware JSON parsing utility.
 * Handles messy LLM output: markdown fences, truncation markers, prose, etc.
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

const TRUNCATION_RE = /^[\s]*([⋮…⋯]+|\.{3,})[\s]*$/u;

/**
 * Parse JSON from LLM output with sanitization and repair.
 */
export function parseLlmJson<T = unknown>(raw: string): LlmJsonResult<T> {
  const candidate = extractJsonCandidate(raw);
  const { sanitized, sawTruncation } = sanitize(candidate);

  // Fast path
  try {
    return { ok: true, value: JSON.parse(sanitized) as T };
  } catch {
    // Try repair
    try {
      const repaired = jsonrepair(sanitized);
      return { ok: true, value: JSON.parse(repaired) as T };
    } catch (e) {
      return {
        ok: false,
        error: {
          kind: sawTruncation ? 'truncated' : 'parse-error',
          message: e instanceof Error ? e.message : 'JSON parse failed',
          raw,
          sanitized,
        },
      };
    }
  }
}

function extractJsonCandidate(raw: string): string {
  if (!raw) return '{}';

  // 1. ```json ... ```
  const jsonFence = raw.match(/```json\s*([\s\S]*?)```/i);
  if (jsonFence?.[1]) return jsonFence[1].trim();

  // 2. ``` ... ```
  const anyFence = raw.match(/```\s*([\s\S]*?)```/);
  if (anyFence?.[1]) return anyFence[1].trim();

  // 3. First {/[ to last }/]
  const first = raw.search(/[{[]/);
  if (first !== -1) {
    const last = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (last > first) return raw.slice(first, last + 1);
  }

  return raw.trim();
}

function sanitize(s: string): { sanitized: string; sawTruncation: boolean } {
  let sawTruncation = false;

  // Remove BOM, zero-width, bidi chars
  s = s.replace(/^\uFEFF/, '');
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, '');

  // Process lines
  const lines = s.split(/\r?\n/).filter(line => {
    if (TRUNCATION_RE.test(line)) {
      sawTruncation = true;
      return false;
    }
    if (line.trim() === '```') return false;
    if (/^here is (the )?json[:：]/i.test(line.trim())) return false;
    return true;
  });

  return { sanitized: lines.join('\n').trim() || '{}', sawTruncation };
}
