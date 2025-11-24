import { describe, it } from 'node:test';
import assert from 'node:assert';
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
        assert.ok(template.length > 0, 'Template should not be empty');
        assert.ok(template.includes('{{PROJECT_NAME}}'), 'Template should contain placeholders');
    });

    it('should load architect template', () => {
        const template = loadBrainTemplate('architect');
        assert.ok(template.length > 0);
    });

    it('should load agent template', () => {
        const template = loadBrainTemplate('agent');
        assert.ok(template.length > 0);
    });

    it('should load ticket template', () => {
        const template = loadBrainTemplate('ticket');
        assert.ok(template.length > 0);
    });

    it('should render research template with context', () => {
        const rendered = renderBrainTemplate('research', mockContext);
        assert.ok(rendered.includes('TestProject'), 'Project name should be rendered');
        assert.ok(rendered.includes('TypeScript'), 'Tech stack should be rendered');
        assert.ok(rendered.includes('2025'), 'Year should be rendered');
        // Check context specific
        assert.ok(rendered.includes('Fix bugs'), 'Goal should be rendered as ADDITIONAL_CONTEXT');
    });

    it('should render architect template with context', () => {
        const rendered = renderBrainTemplate('architect', mockContext);
        assert.ok(rendered.includes('TestProject'));
        // Architect template does not use {{RESEARCH}}, it refers to .sdd/best_practices.md
        assert.ok(rendered.includes('.sdd/best_practices.md'));
    });

    it('should throw error for invalid template kind', () => {
        try {
            loadBrainTemplate('invalid' as any);
            assert.fail('Should have thrown error');
        } catch (e: any) {
            assert.ok(e.message.includes('Unknown brain template kind'), 'Should throw unknown kind error');
        }
    });
});
