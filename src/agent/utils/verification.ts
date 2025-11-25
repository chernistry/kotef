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
    diagnosticCommand?: string; // best single command for "error-first" diagnostics
    syntaxCheckCommand?: string; // NEW: Lightweight syntax check
}

/**
 * Detects the project stack and infers appropriate verification commands.
 * Caches results in memory if needed, but for now we re-scan as file structure might change.
 */
export async function detectCommands(cfg: KotefConfig): Promise<DetectedCommands> {
    const rootDir = cfg.rootDir || process.cwd();

    let syntaxCheckCommand: string | undefined;

    // 1. Check for Node.js / Vite
    try {
        const pkgPath = path.join(rootDir, 'package.json');
        const pkgContent = await fs.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        const scripts = pkg.scripts || {};
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        const isVite = 'vite' in deps || await fileExists(rootDir, 'vite.config.ts') || await fileExists(rootDir, 'vite.config.js');

        const stack: ProjectStack = isVite ? 'vite_frontend' : 'node';

        const primaryTest = scripts.test ? 'npm test' : undefined;
        const smokeTest = scripts.dev ? 'npm run dev' : (scripts.start ? 'npm start' : undefined);
        const buildCommand = scripts.build ? 'npm run build' : undefined;
        const lintCommand = scripts.lint ? 'npm run lint' : undefined;

        if (scripts.lint) {
            syntaxCheckCommand = 'npm run lint';
        } else if (await fileExists(rootDir, 'tsconfig.json')) {
            syntaxCheckCommand = 'npx tsc --noEmit';
        }

        // Error-first diagnostic preference:
        // 1) build (compilation errors)
        // 2) primary test
        // 3) lint
        const diagnosticCommand =
            buildCommand ||
            primaryTest ||
            lintCommand ||
            undefined;

        return {
            stack,
            primaryTest,
            smokeTest,
            buildCommand,
            lintCommand,
            diagnosticCommand,
            syntaxCheckCommand
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

        const primaryTest = 'pytest'; // default assumption
        const smokeTest = mainApp ? `python ${mainApp}` : undefined;
        const lintCommand = 'pylint';

        // Simple heuristic: compile all files in current directory
        syntaxCheckCommand = 'python3 -m compileall . -q';

        // Diagnostics: prefer tests, then a generic compile step if tests are missing.
        const diagnosticCommand = primaryTest || 'python -m compileall .';

        return {
            stack: 'python',
            primaryTest,
            smokeTest,
            lintCommand,
            diagnosticCommand,
            syntaxCheckCommand
        };
    }

    // 3. Check for Go
    const hasGoMod = await fileExists(rootDir, 'go.mod');
    if (hasGoMod) {
        const primaryTest = 'go test ./...';
        const smokeTest = 'go run .';
        const buildCommand = 'go build';
        const diagnosticCommand = primaryTest || buildCommand;

        return {
            stack: 'go',
            primaryTest,
            smokeTest,
            buildCommand,
            diagnosticCommand
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
