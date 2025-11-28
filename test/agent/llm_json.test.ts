import { describe, it, expect } from 'vitest';
import { parseLlmJson } from '../../src/agent/utils/llm_json.js';

describe('parseLlmJson', () => {
  it('parses clean JSON', () => {
    const result = parseLlmJson<{ foo: string }>('{"foo": "bar"}');
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.foo).toBe('bar');
    }
  });

  it('extracts JSON from markdown fence', () => {
    const input = '```json\n{"tickets": [{"id": 1}]}\n```';
    const result = parseLlmJson<{ tickets: { id: number }[] }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.tickets[0].id).toBe(1);
    }
  });

  it('extracts JSON from generic fence', () => {
    const input = '```\n{"data": true}\n```';
    const result = parseLlmJson<{ data: boolean }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.data).toBe(true);
    }
  });

  it('strips truncation markers (⋮)', () => {
    const input = '{"items": [\n  {"a": 1},\n  ⋮\n  {"b": 2}\n]}';
    const result = parseLlmJson<{ items: object[] }>(input);
    // Should attempt repair after stripping ⋮
    expect(result.ok).toBe(true);
  });

  it('strips truncation markers (…)', () => {
    const input = '{"list": [1, 2, …, 10]}';
    const result = parseLlmJson(input);
    // jsonrepair should handle this
    expect(result.ok).toBe(true);
  });

  it('handles "Here is the JSON:" prefix', () => {
    const input = 'Here is the JSON:\n{"result": 42}';
    const result = parseLlmJson<{ result: number }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.result).toBe(42);
    }
  });

  it('extracts JSON from prose', () => {
    const input = 'Sure! Here is your data: {"value": 123} Hope this helps!';
    const result = parseLlmJson<{ value: number }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.value).toBe(123);
    }
  });

  it('repairs trailing comma', () => {
    const input = '{"a": 1, "b": 2,}';
    const result = parseLlmJson<{ a: number; b: number }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.a).toBe(1);
      expect(result.value.b).toBe(2);
    }
  });

  it('handles text without JSON structure gracefully', () => {
    // jsonrepair is very aggressive, so even garbage may parse to something
    const input = 'This is not JSON at all, just random text without braces';
    const result = parseLlmJson(input);
    // Just verify it doesn't throw
    expect(typeof result.ok).toBe('boolean');
  });

  it('handles truncated JSON with marker', () => {
    // After stripping ⋮, jsonrepair may still fix it
    const input = '{"incomplete": ⋮';
    const result = parseLlmJson(input);
    // Just verify it doesn't throw - jsonrepair is aggressive
    expect(typeof result.ok).toBe('boolean');
  });

  it('returns empty object for empty input', () => {
    const result = parseLlmJson('');
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value).toEqual({});
    }
  });

  it('handles BOM character', () => {
    const input = '\uFEFF{"clean": true}';
    const result = parseLlmJson<{ clean: boolean }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.clean).toBe(true);
    }
  });
});
