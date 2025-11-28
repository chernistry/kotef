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

    // Legacy template names now alias to consolidated understand_and_design
    it('should load research template (alias for understand_and_design)', () => {
        const template = loadBrainTemplate('research');
        expect(template.length).toBeGreaterThan(0);
        expect(template).toContain('{{PROJECT_NAME}}');
        expect(template).toContain('Best Practices'); // Consolidated template content
    });

    it('should load architect template (alias for understand_and_design)', () => {
        const template = loadBrainTemplate('architect');
        expect(template.length).toBeGreaterThan(0);
        expect(template).toContain('Architect Specification'); // Consolidated template content
    });

    it('should load agent template (alias for understand_and_design)', () => {
        const template = loadBrainTemplate('agent');
        expect(template.length).toBeGreaterThan(0);
    });

    it('should load ticket template', () => {
        const template = loadBrainTemplate('ticket');
        expect(template.length).toBeGreaterThan(0);
    });

    it('should render understand_and_design template with context', () => {
        const rendered = renderBrainTemplate('understand_and_design', mockContext);
        expect(rendered).toContain('TestProject');
        expect(rendered).toContain('TypeScript');
        expect(rendered).toContain('2025');
        expect(rendered).toContain('Fix bugs');
    });

    it('should render plan_work template with context', () => {
        const rendered = renderBrainTemplate('plan_work', mockContext);
        expect(rendered).toContain('Fix bugs'); // Goal is used
    });

    it('should throw error for invalid template kind', () => {
        expect(() => loadBrainTemplate('invalid' as any)).toThrow(/Unknown brain template kind/);
    });
});
