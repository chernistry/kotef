import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type BrainTemplateKind =
    | 'research'
    | 'architect'
    | 'agent'
    | 'ticket'
    | 'architect_delta'
    | 'bootstrap_project';

export interface SddPromptContext {
    projectName: string;
    projectDescription?: string;
    domain: string;
    techStack: string;
    year: number;
    // Additional fields for specific templates
    goal?: string;
    /** Optional long-form context (e.g., web research findings) injected into templates that support {{ADDITIONAL_CONTEXT}}. */
    additionalContext?: string;
    research?: string;
    architect?: string;
    ticket?: string;
}

const TEMPLATE_FILES: Record<BrainTemplateKind, string> = {
    research: 'research_template.md',
    architect: 'architect_template.md',
    agent: 'agent_template.md',
    ticket: 'ticket_template.md',
    architect_delta: 'architect_delta_template.md',
    bootstrap_project: 'bootstrap_project.md'
};

export function loadBrainTemplate(kind: BrainTemplateKind): string {
    // Resolve path relative to this file
    // In dev: src/sdd/template_driver.ts -> ../agent/prompts/brain
    // In prod: dist/src/sdd/template_driver.js -> ../agent/prompts/brain
    const templatesDir = path.resolve(__dirname, '../agent/prompts/brain');
    const filename = TEMPLATE_FILES[kind];

    if (!filename) {
        throw new Error(`Unknown brain template kind: '${kind}'`);
    }

    const filePath = path.join(templatesDir, filename);

    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (e: any) {
        throw new Error(`Failed to load brain template '${kind}' from ${filePath}: ${e.message}`);
    }
}

export function renderBrainTemplate(
    kind: BrainTemplateKind,
    ctx: SddPromptContext
): string {
    const template = loadBrainTemplate(kind);

    // Simple placeholder replacement
    let rendered = template;

    // Common placeholders
    rendered = rendered.replace(/{{PROJECT_NAME}}/g, ctx.projectName);
    rendered = rendered.replace(/{{PROJECT_DESCRIPTION_CONTENT}}/g, ctx.projectDescription || 'No description provided.');
    rendered = rendered.replace(/{{DOMAIN}}/g, ctx.domain);
    rendered = rendered.replace(/{{TECH_STACK}}/g, ctx.techStack);
    rendered = rendered.replace(/{{YEAR}}/g, ctx.year.toString());

    // Context-specific placeholders
    if (ctx.goal) {
        rendered = rendered.replace(/{{GOAL}}/g, ctx.goal);
    }
    if (ctx.additionalContext) {
        rendered = rendered.replace(/{{ADDITIONAL_CONTEXT}}/g, ctx.additionalContext);
    } else if (ctx.goal) {
        // Backwards-compatible fallback: when no explicit additionalContext is provided,
        // keep using the goal as additional context.
        rendered = rendered.replace(/{{ADDITIONAL_CONTEXT}}/g, ctx.goal);
    }
    if (ctx.research) rendered = rendered.replace(/{{RESEARCH}}/g, ctx.research);
    if (ctx.architect) rendered = rendered.replace(/{{ARCHITECT}}/g, ctx.architect);
    if (ctx.ticket) rendered = rendered.replace(/{{TICKET}}/g, ctx.ticket);

    // Check for leftover placeholders (optional, but good for debugging)
    // We won't throw for now as some templates might have optional sections or other placeholders
    // But we can warn if we see {{...}}

    return rendered;
}
