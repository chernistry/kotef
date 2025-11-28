import { describe, it, expect } from 'vitest';
import { validateBestPracticesDoc, validateArchitectDoc } from '../../src/agent/utils/sdd_validation.js';

describe('SDD Validation', () => {
    it('should validate a complete best practices doc', () => {
        const content = `
# Best Practices & Research

## 1. TL;DR
Summary...

## 2. Landscape
Landscape...

## 3. Architecture Patterns
Patterns...

## 4. Conflicting Practices & Alternatives
Conflicts...

## 5. References
Refs...
`;
        const result = validateBestPracticesDoc(content);
        expect(result.ok).toBe(true);
        expect(result.missingSections).toHaveLength(0);
        expect(result.truncated).toBe(false);
    });

    it('should detect missing sections', () => {
        const content = `
# Best Practices & Research

## 1. TL;DR
Summary...
`;
        const result = validateBestPracticesDoc(content);
        expect(result.ok).toBe(false);
        expect(result.missingSections).toContain('## 2. Landscape');
    });

    it('should detect truncation (incomplete header)', () => {
        const content = `
# Best Practices & Research

## 1. TL;DR
Summary...

## 2. Landscape
`;
        const result = validateBestPracticesDoc(content);
        expect(result.ok).toBe(false);
        expect(result.truncated).toBe(true);
    });

    it('should detect truncation (no punctuation)', () => {
        const content = `
# Best Practices & Research

## 1. TL;DR
Summary is going to be cut off right here because the model ran out of tokens and stopped generating
`;
        const result = validateBestPracticesDoc(content);
        expect(result.ok).toBe(false);
        expect(result.truncated).toBe(true);
    });

    it('should validate a complete architect doc', () => {
        const content = `
# Architect Specification

## Hard Constraints
Domain prohibitions here.

## Go/No-Go Preconditions
Prerequisites here.

## Goals & Non-Goals
Goals and non-goals here.

## Metric Profile & Strategic Risk Map
Metrics here.

## Alternatives
Alternative approaches here.

## Research Conflicts & Resolutions
Conflicts here.

## MVP Recommendation
MVP choice here.

## Architecture Overview
Overview here.

## Components
Component list here.

## Code Standards & Conventions
Standards here.

## Implementation Steps
Steps here.
`;
        const result = validateArchitectDoc(content);
        expect(result.ok).toBe(true);
    });
});
