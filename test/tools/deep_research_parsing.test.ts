import { describe, it, expect } from 'vitest';
import { parseLlmJson } from '../../src/tools/deep_research.js';

describe('Deep Research JSON Parsing', () => {
    it('should parse valid JSON', () => {
        const input = '{"key": "value"}';
        expect(parseLlmJson(input)).toEqual({ key: 'value' });
    });

    it('should parse JSON in markdown code blocks', () => {
        const input = '```json\n{"key": "value"}\n```';
        expect(parseLlmJson(input)).toEqual({ key: 'value' });
    });

    it('should parse JSON with conversational prefix/suffix', () => {
        const input = 'Here is the JSON:\n{"key": "value"}\nHope this helps!';
        expect(parseLlmJson(input)).toEqual({ key: 'value' });
    });

    it('should parse JSON with minor syntax errors (jsonrepair)', () => {
        // Missing quotes on key, trailing comma
        const input = '{key: "value",}';
        expect(parseLlmJson(input)).toEqual({ key: 'value' });
    });

    it('should return null for invalid JSON', () => {
        const input = 'Not JSON at all';
        expect(parseLlmJson(input)).toBeNull();
    });

    it('should handle array root', () => {
        const input = '[1, 2, 3]';
        expect(parseLlmJson(input)).toEqual([1, 2, 3]);
    });

    it('should handle nested structures', () => {
        const input = '{"a": {"b": [1, 2]}}';
        expect(parseLlmJson(input)).toEqual({ a: { b: [1, 2] } });
    });
});
