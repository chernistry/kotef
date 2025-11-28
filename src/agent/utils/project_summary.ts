import { KotefConfig } from '../../core/config.js';
import { listFiles, readFile } from '../../tools/fs.js';
import { createLogger } from '../../core/logger.js';
import path from 'node:path';

const log = createLogger('project-summary');

export interface ProjectSummary {
    languages: string[];
    hasFrontend: boolean;
    hasBackend: boolean;
    hasTests: boolean;
    frameworks: string[];
    configFiles: string[];
    mainFiles: string[];
    entryPoints: string[];
    keyModules: string[];  // Ticket 07: key modules/services
    projectType: 'frontend' | 'backend' | 'fullstack' | 'library' | 'mixed';
}

/**
 * Builds a summary of the project by analyzing file structure, extensions, and config files.
 * This enables the agent to understand the tech stack before making decisions.
 */
export async function buildProjectSummary(
    rootDir: string,
    cfg: KotefConfig
): Promise<ProjectSummary> {
    log.info('Building project summary', { rootDir });

    // 1. List all relevant files
    const pattern = '**/*.{ts,tsx,js,jsx,py,pyw,go,rs,java,cs,swift,md,json,yml,yaml,toml,html,css,vue}';
    const files = await listFiles({ rootDir }, pattern);

    // 2. Analyze file extensions for languages
    const languages = detectLanguages(files);

    // 3. Identify config and main files
    const configFiles = files.filter(isConfigFile);
    const mainFiles = files.filter(f => isMainFile(f, languages));
    const entryPoints = files.filter(f => isEntryPoint(f, languages));

    // 4. Detect frameworks and project characteristics
    const frameworks = await detectFrameworks(rootDir, cfg, files, configFiles);
    const hasTests = files.some(f => isTestFile(f));

    // 5. Detect key modules (Ticket 07)
    const keyModules = detectKeyModules(files);

    // 6. Determine project type
    const hasFrontend = detectsFrontend(files, frameworks);
    const hasBackend = detectsBackend(files, frameworks, languages);
    const projectType = inferProjectType(hasFrontend, hasBackend, frameworks);

    const summary: ProjectSummary = {
        languages,
        hasFrontend,
        hasBackend,
        hasTests,
        frameworks,
        configFiles,
        mainFiles,
        entryPoints,
        keyModules,
        projectType
    };

    log.info('Project summary built', { summary });
    return summary;
}

/**
 * Detect languages from file extensions
 */
function detectLanguages(files: string[]): string[] {
    const langMap: Record<string, string[]> = {
        typescript: ['.ts', '.tsx'],
        javascript: ['.js', '.jsx', '.mjs', '.cjs'],
        python: ['.py', '.pyw'],
        go: ['.go'],
        rust: ['.rs'],
        java: ['.java'],
        csharp: ['.cs'],
        swift: ['.swift'],
        vue: ['.vue']
    };

    const detected = new Set<string>();

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        for (const [lang, exts] of Object.entries(langMap)) {
            if (exts.includes(ext)) {
                detected.add(lang);
            }
        }
    }

    return Array.from(detected).sort();
}

/**
 * Check if file is a configuration file
 */
function isConfigFile(file: string): boolean {
    const baseName = path.basename(file).toLowerCase();
    const configPatterns = [
        'package.json',
        'tsconfig.json',
        'vite.config',
        'next.config',
        'webpack.config',
        'rollup.config',
        'tailwind.config',
        'pyproject.toml',
        'setup.py',
        'requirements.txt',
        'go.mod',
        'cargo.toml',
        'pom.xml',
        '.gitignore',
        'pytest.ini',
        'jest.config',
        'vitest.config'
    ];

    return configPatterns.some(pattern => baseName.includes(pattern));
}

/**
 * Check if file is likely a main/app entry point
 */
function isMainFile(file: string, languages: string[]): boolean {
    const baseName = path.basename(file).toLowerCase();
    const dirName = path.dirname(file);

    // Python main files
    if (languages.includes('python')) {
        if (['app.py', 'main.py', 'manage.py', '__main__.py'].includes(baseName)) {
            return true;
        }
    }

    // Go main files
    if (languages.includes('go')) {
        if (baseName === 'main.go' || dirName.includes('cmd')) {
            return true;
        }
    }

    // JS/TS main files
    if (languages.includes('javascript') || languages.includes('typescript')) {
        if (['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js'].includes(baseName)) {
            return true;
        }
    }

    return false;
}

/**
 * Check if file is an entry point (HTML, main, etc.)
 */
function isEntryPoint(file: string, languages: string[]): boolean {
    const baseName = path.basename(file).toLowerCase();

    if (baseName === 'index.html') return true;
    if (isMainFile(file, languages)) return true;

    return false;
}

/**
 * Check if file is a test file
 */
function isTestFile(file: string): boolean {
    const lower = file.toLowerCase();
    return (
        lower.includes('.test.') ||
        lower.includes('.spec.') ||
        lower.includes('__tests__') ||
        lower.includes('/tests/') ||
        lower.includes('/test/')
    );
}

/**
 * Detect frameworks from package.json, config files, and file patterns
 */
async function detectFrameworks(
    rootDir: string,
    cfg: KotefConfig,
    files: string[],
    configFiles: string[]
): Promise<string[]> {
    const frameworks = new Set<string>();

    // Check for specific config files
    for (const configFile of configFiles) {
        const baseName = path.basename(configFile).toLowerCase();

        if (baseName.includes('vite.config')) frameworks.add('vite');
        if (baseName.includes('next.config')) frameworks.add('next.js');
        if (baseName.includes('webpack.config')) frameworks.add('webpack');
        if (baseName.includes('tailwind.config')) frameworks.add('tailwindcss');
        if (baseName.includes('jest.config')) frameworks.add('jest');
        if (baseName.includes('vitest.config')) frameworks.add('vitest');
        if (baseName.includes('pytest.ini')) frameworks.add('pytest');
    }

    // Check package.json for dependencies
    const packageJson = files.find(f => path.basename(f) === 'package.json');
    if (packageJson) {
        try {
            const content = await readFile({ rootDir }, packageJson);
            const pkg = JSON.parse(content);
            const allDeps = {
                ...(pkg.dependencies || {}),
                ...(pkg.devDependencies || {})
            };

            if (allDeps.vite) frameworks.add('vite');
            if (allDeps.next) frameworks.add('next.js');
            if (allDeps.react) frameworks.add('react');
            if (allDeps.vue) frameworks.add('vue');
            if (allDeps['@angular/core']) frameworks.add('angular');
            if (allDeps.express) frameworks.add('express');
            if (allDeps.fastify) frameworks.add('fastify');
            if (allDeps.vitest) frameworks.add('vitest');
            if (allDeps.jest) frameworks.add('jest');
        } catch (err) {
            log.warn('Failed to parse package.json', { error: (err as Error).message });
        }
    }

    // Check for Python frameworks
    const hasPython = files.some(f => f.endsWith('.py'));
    if (hasPython) {
        const hasFlask = files.some(f => path.basename(f) === 'app.py');
        const hasDjango = files.some(f => path.basename(f) === 'manage.py');

        if (hasFlask) frameworks.add('flask');
        if (hasDjango) frameworks.add('django');

        // Check requirements.txt or pyproject.toml
        const reqFile = files.find(f => path.basename(f).toLowerCase() === 'requirements.txt');
        if (reqFile) {
            try {
                const content = await readFile({ rootDir }, reqFile);
                if (content.toLowerCase().includes('flask')) frameworks.add('flask');
                if (content.toLowerCase().includes('django')) frameworks.add('django');
                if (content.toLowerCase().includes('fastapi')) frameworks.add('fastapi');
                if (content.toLowerCase().includes('pytest')) frameworks.add('pytest');
            } catch (err) {
                log.warn('Failed to read requirements.txt', { error: (err as Error).message });
            }
        }
    }

    return Array.from(frameworks).sort();
}

/**
 * Detect if project has frontend characteristics
 */
function detectsFrontend(files: string[], frameworks: string[]): boolean {
    // Has HTML entry point
    if (files.some(f => path.basename(f).toLowerCase() === 'index.html')) {
        return true;
    }

    // Has frontend frameworks
    const frontendFrameworks = ['react', 'vue', 'angular', 'vite', 'next.js'];
    if (frameworks.some(fw => frontendFrameworks.includes(fw))) {
        return true;
    }

    // Has component directories
    const hasComponents = files.some(f =>
        f.toLowerCase().includes('/components/') ||
        f.toLowerCase().includes('/views/') ||
        f.toLowerCase().includes('/pages/')
    );

    return hasComponents;
}

/**
 * Detect if project has backend characteristics
 */
function detectsBackend(files: string[], frameworks: string[], languages: string[]): boolean {
    // Has backend frameworks
    const backendFrameworks = ['express', 'fastify', 'flask', 'django', 'fastapi'];
    if (frameworks.some(fw => backendFrameworks.includes(fw))) {
        return true;
    }

    // Has API/routes directories
    const hasBackendDirs = files.some(f =>
        f.toLowerCase().includes('/api/') ||
        f.toLowerCase().includes('/routes/') ||
        f.toLowerCase().includes('/controllers/') ||
        f.toLowerCase().includes('/models/')
    );

    // Python or Go without frontend markers often indicates backend
    if ((languages.includes('python') || languages.includes('go')) && hasBackendDirs) {
        return true;
    }

    return hasBackendDirs;
}

/**
 * Infer overall project type from characteristics
 */
function inferProjectType(
    hasFrontend: boolean,
    hasBackend: boolean,
    frameworks: string[]
): ProjectSummary['projectType'] {
    if (hasFrontend && hasBackend) return 'fullstack';
    if (hasFrontend) return 'frontend';
    if (hasBackend) return 'backend';

    // If has Jest/Vitest but no clear frontend/backend, might be a library
    const testFrameworks = ['jest', 'vitest', 'pytest'];
    if (frameworks.some(fw => testFrameworks.includes(fw)) && frameworks.length > 0) {
        return 'library';
    }

    return 'mixed';
}

/**
 * Detect key modules/services by filesystem patterns (Ticket 07)
 */
function detectKeyModules(files: string[]): string[] {
    const keyPatterns = [
        /src\/(?:services|lib|core|utils|helpers|modules)\/[^/]+\.[jt]sx?$/i,
        /src\/(?:api|routes|controllers)\/[^/]+\.[jt]sx?$/i,
        /src\/(?:features|components|pages)\/[^/]+\/index\.[jt]sx?$/i,
        /app\/(?:api|routes)\/[^/]+\/route\.[jt]sx?$/i,
        /pages\/(?:api\/)?[^/]+\.[jt]sx?$/i
    ];

    const modules = new Set<string>();

    for (const file of files) {
        // Skip test files and node_modules
        if (file.includes('node_modules') || isTestFile(file)) continue;

        for (const pattern of keyPatterns) {
            if (pattern.test(file)) {
                // Extract module path (e.g., src/services/auth.ts -> src/services/auth)
                const modulePath = file.replace(/\.[jt]sx?$/, '');
                modules.add(modulePath);
                break;
            }
        }
    }

    // Also add directories that contain multiple files (likely modules)
    const dirCounts = new Map<string, number>();
    for (const file of files) {
        if (file.includes('node_modules') || isTestFile(file)) continue;
        const dir = path.dirname(file);
        if (dir.includes('/src/') || dir.includes('/app/') || dir.includes('/lib/')) {
            dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
        }
    }

    // Add directories with 3+ files as key modules
    for (const [dir, count] of dirCounts) {
        if (count >= 3 && !dir.includes('__')) {
            modules.add(dir);
        }
    }

    return Array.from(modules).slice(0, 20).sort();
}
