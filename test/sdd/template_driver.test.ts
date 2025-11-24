import { describe, it, expect } from 'vitest';
import { loadBrainTemplate, renderBrainTemplate, SddPromptContext } from '../../src/sdd/template_driver.js';

describe('SDDRush Template Driver', () => {
    const mockContext: SddPromptContext = {
        projectName: 'TestProject',
        projectDescription: 'A test project',
        domain: 'Testing',
        techStack: 'TypeScript',
        year: 2025,
        goal: 'Fix bugs',
        research: 'Research findings',
        architect: 'Architecture plan',
        ticket: 'Ticket details'
    };

    it('should load research template', () => {
        const template = loadBrainTemplate('research');
        expect(template.length).toBeGreaterThan(0);
        expect(template).toContain('{{PROJECT_NAME}}');
    });

    it('should load architect template', () => {
        const template = loadBrainTemplate('architect');
        expect(template.length).toBeGreaterThan(0);
    });

    it('should load agent template', () => {
        const template = loadBrainTemplate('agent');
        expect(template.length).toBeGreaterThan(0);
    });

    it('should load ticket template', () => {
        const template = loadBrainTemplate('ticket');
        expect(template.length).toBeGreaterThan(0);
    });

    it('should render research template with context', () => {
        const rendered = renderBrainTemplate('research', mockContext);
        expect(rendered).toContain('TestProject');
        expect(rendered).toContain('TypeScript');
        expect(rendered).toContain('2025');
        // Check context specific
        expect(rendered).toContain('Fix bugs');
    });

    it('should render architect template with context', () => {
        const rendered = renderBrainTemplate('architect', mockContext);
        expect(rendered).toContain('TestProject');
        // Architect template does not use {{RESEARCH}}, it refers to .sdd/best_practices.md
        expect(rendered).toContain('.sdd/best_practices.md');
    });

    it('should throw error for invalid template kind', () => {
        expect(() => loadBrainTemplate('invalid' as any)).toThrow(/Unknown brain template kind/);
    });
});
