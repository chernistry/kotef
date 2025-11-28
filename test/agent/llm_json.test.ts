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
    expect(result.ok).toBe(true);
  });

  it('strips truncation markers (…)', () => {
    const input = '{"list": [1, 2, …, 10]}';
    const result = parseLlmJson(input);
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
    const input = 'This is not JSON at all, just random text without braces';
    const result = parseLlmJson(input);
    expect(typeof result.ok).toBe('boolean');
  });

  it('handles truncated JSON with marker', () => {
    const input = '{"incomplete": ⋮';
    const result = parseLlmJson(input);
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

  // New tests for hireex-inspired features

  it('converts Python True/False/None to JSON', () => {
    const input = '{"enabled": True, "disabled": False, "value": None}';
    const result = parseLlmJson<{ enabled: boolean; disabled: boolean; value: null }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.enabled).toBe(true);
      expect(result.value.disabled).toBe(false);
      expect(result.value.value).toBe(null);
    }
  });

  it('converts single quotes to double quotes', () => {
    const input = "{'name': 'test', 'count': 5}";
    const result = parseLlmJson<{ name: string; count: number }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.name).toBe('test');
      expect(result.value.count).toBe(5);
    }
  });

  it('quotes unquoted keys', () => {
    const input = '{name: "test", count: 5}';
    const result = parseLlmJson<{ name: string; count: number }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.name).toBe('test');
      expect(result.value.count).toBe(5);
    }
  });

  it('finds largest JSON object in mixed content', () => {
    const input = 'Small: {"a":1} and Large: {"tickets": [{"id": 1}, {"id": 2}], "count": 2} end';
    const result = parseLlmJson<{ tickets: { id: number }[]; count: number }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.tickets.length).toBe(2);
      expect(result.value.count).toBe(2);
    }
  });

  it('handles newlines inside string values', () => {
    const input = '{"text": "line1\nline2\nline3"}';
    const result = parseLlmJson<{ text: string }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.text).toContain('line1');
    }
  });

  it('handles nested objects with various issues', () => {
    const input = `{
      name: 'test',
      enabled: True,
      config: {
        'nested': 'value',
        count: 10,
      },
    }`;
    const result = parseLlmJson<{ name: string; enabled: boolean; config: { nested: string; count: number } }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.name).toBe('test');
      expect(result.value.enabled).toBe(true);
      expect(result.value.config.nested).toBe('value');
    }
  });

  it('extracts outer JSON when string values contain mermaid fences', () => {
    const input = `{
  "scopeAnalysis": {"appetite": "Small"},
  "architect": "## Overview\\n\`\`\`mermaid\\ngraph TD\\n    A[Start] --> B[End]\\n\`\`\`\\nMore text"
}`;
    const result = parseLlmJson<{ scopeAnalysis: { appetite: string }; architect: string }>(input);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.scopeAnalysis.appetite).toBe('Small');
      expect(result.value.architect).toContain('mermaid');
    }
  });
  it('handles markdown with unescaped quotes and newlines via schema-aware parsing', () => {
    // Simulate the messy input that might come from LLM (literal newlines and unescaped quotes)
    const messyInput = `{
  "scopeAnalysis": { "appetite": "Small" },
  "bestPractices": "# Header
- Item 1
- **Pattern A**: (e.g., "glass": backdrop-blur)
- Item 2",
  "architect": "Some architect text"
}`;

    const result = parseLlmJson<{ scopeAnalysis: any; bestPractices: string; architect: string }>(messyInput, {
      knownKeys: ['scopeAnalysis', 'bestPractices', 'architect']
    });

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.scopeAnalysis.appetite).toBe('Small');
      expect(result.value.bestPractices).toContain('Pattern A');
      expect(result.value.bestPractices).toContain('"glass": backdrop-blur');
      expect(result.value.architect).toBe('Some architect text');
    }
  });
  it('handles array of objects with markdown content via schema-aware parsing', () => {
    // Simulate sddPlanWork output with tickets array
    const messyInput = `{
  "tickets": [
    {
      "filename": "01.md",
      "content": "# Ticket 01\\n- Item 1\\n- Code: 'const x = 1;'\\n- Quote: \\"hello\\""
    },
    {
      "filename": "02.md",
      "content": "# Ticket 02
- Literal newline here
- Unescaped quote inside: \\"glass\\": true"
    }
  ]
}`;

    const result = parseLlmJson<{ tickets: any[] }>(messyInput, {
      knownKeys: ['tickets']
    });

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.value.tickets).toHaveLength(2);
      expect(result.value.tickets[0].filename).toBe('01.md');
      expect(result.value.tickets[1].content).toContain('glass');
    }
  });
});
