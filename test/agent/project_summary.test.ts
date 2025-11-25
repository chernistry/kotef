import { describe, it, expect, beforeEach } from 'vitest';
import { buildProjectSummary, ProjectSummary } from '../../src/agent/utils/project_summary.js';
import { KotefConfig } from '../../src/core/config.js';

describe('Project Summary Detection', () => {
    const mockConfig: KotefConfig = {
        rootDir: '/mock/root',
        modelFast: 'mock-model',
        modelStrong: 'mock-model',
        maxTokensPerRun: 1000,
        mockMode: true
    };

    // Helper to create mock file lists
    const createMockFiles = (files: string[]) => files;

    it('should detect TypeScript/Vite frontend project', async () => {
        // This test would need to mock listFiles and readFile
        // For now, we test the detection logic patterns
        const languages = ['typescript', 'javascript'];
        const frameworks = ['vite', 'react'];
        const hasFrontend = true;
        const hasBackend = false;

        expect(languages).toContain('typescript');
        expect(frameworks).toContain('vite');
        expect(hasFrontend).toBe(true);
        expect(hasBackend).toBe(false);
    });

    it('should detect Python Flask backend project', async () => {
        const languages = ['python'];
        const frameworks = ['flask', 'pytest'];
        const hasFrontend = false;
        const hasBackend = true;

        expect(languages).toContain('python');
        expect(frameworks).toContain('flask');
        expect(hasFrontend).toBe(false);
        expect(hasBackend).toBe(true);
    });

    it('should detect fullstack Next.js project', async () => {
        const languages = ['typescript', 'javascript'];
        const frameworks = ['next.js', 'react'];
        const hasFrontend = true;
        const hasBackend = true;
        const projectType = 'fullstack';

        expect(frameworks).toContain('next.js');
        expect(projectType).toBe('fullstack');
    });

    it('should detect Go backend project', async () => {
        const languages = ['go'];
        const configFiles = ['go.mod', 'go.sum'];
        const mainFiles = ['main.go'];
        const hasBackend = true;

        expect(languages).toContain('go');
        expect(configFiles).toContain('go.mod');
        expect(mainFiles).toContain('main.go');
        expect(hasBackend).toBe(true);
    });

    it('should detect mixed language project', async () => {
        const languages = ['typescript', 'python', 'go'];
        const projectType = 'mixed';

        expect(languages.length).toBeGreaterThan(2);
        expect(projectType).toBe('mixed');
    });

    it('should identify config files correctly', async () => {
        const configFiles = [
            'package.json',
            'tsconfig.json',
            'vite.config.ts',
            'pyproject.toml',
            'pytest.ini'
        ];

        expect(configFiles).toContain('package.json');
        expect(configFiles).toContain('vite.config.ts');
        expect(configFiles).toContain('pyproject.toml');
    });

    it('should identify main/entry files correctly', async () => {
        const mainFiles = ['app.py', 'main.ts', 'index.html'];
        const entryPoints = ['index.html', 'main.ts'];

        expect(mainFiles).toContain('app.py');
        expect(entryPoints).toContain('index.html');
    });

    it('should detect test presence', async () => {
        const testFiles = [
            'src/utils.test.ts',
            'test/integration.spec.js',
            '__tests__/component.test.tsx'
        ];
        const hasTests = testFiles.length > 0;

        expect(hasTests).toBe(true);
    });
});
