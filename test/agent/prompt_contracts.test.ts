
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Define schemas matching the prompts

const PlannerSchema = z.object({
    next: z.enum(['researcher', 'coder', 'verifier', 'done', 'snitch', 'ask_human']),
    reason: z.string(),
    profile: z.enum(['strict', 'fast', 'smoke', 'yolo']).optional(),
    plan: z.array(z.object({
        id: z.string(),
        owner: z.enum(['planner', 'coder', 'researcher', 'verifier']),
        action: z.string(),
        detail: z.string(),
        targets: z.array(z.string()).optional(),
        evidence: z.array(z.string()).optional(),
        risk: z.enum(['low', 'medium', 'high']).optional()
    })),
    needs: z.object({
        research_queries: z.array(z.string()).optional(),
        files: z.array(z.string()).optional(),
        tests: z.array(z.string()).optional()
    }).optional()
});

const ResearcherSchema = z.object({
    queries: z.array(z.string()),
    findings: z.array(z.object({
        id: z.string().optional(),
        summary: z.string(),
        sources: z.array(z.string()).optional()
    })),
    risks: z.array(z.string()).optional(),
    ready_for_coder: z.boolean(),
    reason: z.string()
});

const CoderSchema = z.object({
    status: z.enum(['done', 'partial', 'blocked']),
    changes: z.array(z.string()),
    tests: z.string().optional(),
    notes: z.string().optional()
});

const VerifierSchema = z.object({
    status: z.enum(['passed', 'failed', 'blocked']),
    command: z.string().optional(),
    summary: z.string(),
    next: z.enum(['done', 'planner']),
    notes: z.string().optional()
});

describe('Prompt Contracts', () => {
    it('should validate Planner schema', () => {
        const example = {
            next: 'researcher',
            reason: 'Need more info',
            profile: 'fast',
            plan: [{ id: '1', owner: 'researcher', action: 'research', detail: 'Check docs' }],
            needs: { research_queries: ['how to x'] }
        };
        expect(() => PlannerSchema.parse(example)).not.toThrow();
    });

    it('should validate Researcher schema', () => {
        const example = {
            queries: ['query 1'],
            findings: [{ summary: 'found x', sources: ['http://x'] }],
            ready_for_coder: true,
            reason: 'good to go'
        };
        expect(() => ResearcherSchema.parse(example)).not.toThrow();
    });

    it('should validate Coder schema', () => {
        const example = {
            status: 'done',
            changes: ['file.ts'],
            tests: 'npm test -> pass',
            notes: 'all good'
        };
        expect(() => CoderSchema.parse(example)).not.toThrow();
    });

    it('should validate Verifier schema', () => {
        const example = {
            status: 'passed',
            summary: 'Tests passed',
            next: 'done',
            notes: 'LGTM'
        };
        expect(() => VerifierSchema.parse(example)).not.toThrow();
    });
});
