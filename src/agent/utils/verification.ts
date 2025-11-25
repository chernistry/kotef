import path from 'node:path';
import fs from 'node:fs/promises';
import { listFiles } from '../../tools/fs.js';
import { KotefConfig } from '../../core/config.js';

export type ProjectStack = 'node' | 'vite_frontend' | 'python' | 'go' | 'unknown';

export interface DetectedCommands {
    stack: ProjectStack;
    primaryTest?: string;   // e.g. "npm test", "pytest"
    smokeTest?: string;     // e.g. "npm run dev", "python app.py"
    buildCommand?: string;  // e.g. "npm run build"
    lintCommand?: string;   // e.g. "npm run lint", "pylint"
}

/**
 * Detects the project stack and infers appropriate verification commands.
 * Caches results in memory if needed, but for now we re-scan as file structure might change.
 */
export async function detectCommands(cfg: KotefConfig): Promise<DetectedCommands> {
    const rootDir = cfg.rootDir || process.cwd();

    // 1. Check for Node.js / Vite
    try {
        const pkgPath = path.join(rootDir, 'package.json');
        const pkgContent = await fs.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        const scripts = pkg.scripts || {};
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        const isVite = 'vite' in deps || await fileExists(rootDir, 'vite.config.ts') || await fileExists(rootDir, 'vite.config.js');

        const stack: ProjectStack = isVite ? 'vite_frontend' : 'node';

        return {
            stack,
            primaryTest: scripts.test ? 'npm test' : undefined,
            smokeTest: scripts.dev ? 'npm run dev' : (scripts.start ? 'npm start' : undefined),
            buildCommand: scripts.build ? 'npm run build' : undefined,
            lintCommand: scripts.lint ? 'npm run lint' : undefined
        };
    } catch (e) {
        // Not a Node project or invalid package.json
    }

    // 2. Check for Python
    const hasPyProject = await fileExists(rootDir, 'pyproject.toml');
    const hasRequirements = await fileExists(rootDir, 'requirements.txt');
    const pyFiles = await listFiles({ rootDir }, '**/*.py');

    if (hasPyProject || hasRequirements || pyFiles.length > 0) {
        // Try to find main app file for smoke test
        let mainApp = pyFiles.find(f => f === 'app.py' || f === 'main.py' || f === 'manage.py');

        return {
            stack: 'python',
            primaryTest: 'pytest', // Default assumption
            smokeTest: mainApp ? `python ${mainApp}` : undefined,
            lintCommand: 'pylint' // Default assumption
        };
    }

    // 3. Check for Go
    const hasGoMod = await fileExists(rootDir, 'go.mod');
    if (hasGoMod) {
        return {
            stack: 'go',
            primaryTest: 'go test ./...',
            smokeTest: 'go run .',
            buildCommand: 'go build'
        };
    }

    return { stack: 'unknown' };
}

async function fileExists(dir: string, file: string): Promise<boolean> {
    try {
        await fs.access(path.join(dir, file));
        return true;
    } catch {
        return false;
    }
}
