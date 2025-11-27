import { detect } from 'detect-package-manager';
import path from 'node:path';
import fs from 'node:fs/promises';

export type PackageManagerName =
    | 'npm' | 'yarn' | 'pnpm' | 'bun'
    | 'pip' | 'poetry' | 'pipenv'
    | 'go'
    | 'cargo'
    | 'maven' | 'gradle';

export interface PackageManager {
    name: PackageManagerName;
    installCommand: string;
    runCommand: (script: string) => string;
    execCommand: (command: string) => string;
}

const JS_CONFIGS: Record<string, PackageManager> = {
    npm: {
        name: 'npm',
        installCommand: 'npm install',
        runCommand: (script) => `npm run ${script}`,
        execCommand: (command) => `npx ${command}`
    },
    yarn: {
        name: 'yarn',
        installCommand: 'yarn install',
        runCommand: (script) => `yarn run ${script}`,
        execCommand: (command) => `yarn dlx ${command}`
    },
    pnpm: {
        name: 'pnpm',
        installCommand: 'pnpm install',
        runCommand: (script) => `pnpm run ${script}`,
        execCommand: (command) => `pnpm dlx ${command}`
    },
    bun: {
        name: 'bun',
        installCommand: 'bun install',
        runCommand: (script) => `bun run ${script}`,
        execCommand: (command) => `bunx ${command}`
    }
};

const PYTHON_CONFIGS: Record<string, PackageManager> = {
    pip: {
        name: 'pip',
        installCommand: 'pip install -r requirements.txt',
        runCommand: (script) => `python ${script}`, // Assumes script is a file path
        execCommand: (command) => `python -m ${command}`
    },
    poetry: {
        name: 'poetry',
        installCommand: 'poetry install',
        runCommand: (script) => `poetry run ${script}`,
        execCommand: (command) => `poetry run ${command}`
    },
    pipenv: {
        name: 'pipenv',
        installCommand: 'pipenv install',
        runCommand: (script) => `pipenv run ${script}`,
        execCommand: (command) => `pipenv run ${command}`
    }
};

const GO_CONFIG: PackageManager = {
    name: 'go',
    installCommand: 'go mod download',
    runCommand: (script) => `go run ${script}`,
    execCommand: (command) => `go run ${command}`
};

const CARGO_CONFIG: PackageManager = {
    name: 'cargo',
    installCommand: 'cargo build',
    runCommand: (script) => `cargo run --bin ${script}`, // Best effort
    execCommand: (command) => `cargo ${command}`
};

const MAVEN_CONFIG: PackageManager = {
    name: 'maven',
    installCommand: 'mvn install',
    runCommand: (script) => `mvn exec:java -Dexec.mainClass="${script}"`,
    execCommand: (command) => `mvn ${command}`
};

const GRADLE_CONFIG: PackageManager = {
    name: 'gradle',
    installCommand: 'gradle build',
    runCommand: (script) => `gradle run --args="${script}"`,
    execCommand: (command) => `gradle ${command}`
};

/**
 * Detects the package manager used in the given root directory.
 * Checks for language-specific lockfiles/manifests first, then falls back to JS detection.
 */
export async function detectPackageManager(rootDir: string): Promise<PackageManager> {
    // 1. Check for Python
    if (await fileExists(rootDir, 'poetry.lock')) return PYTHON_CONFIGS.poetry;
    if (await fileExists(rootDir, 'Pipfile')) return PYTHON_CONFIGS.pipenv;
    if (await fileExists(rootDir, 'requirements.txt')) return PYTHON_CONFIGS.pip;
    // pyproject.toml is ambiguous, but often implies poetry or modern pip tools. 
    // We'll default to pip if no other indicator is present, assuming standard python usage.
    if (await fileExists(rootDir, 'pyproject.toml')) return PYTHON_CONFIGS.pip;

    // 2. Check for Go
    if (await fileExists(rootDir, 'go.mod')) return GO_CONFIG;

    // 3. Check for Rust
    if (await fileExists(rootDir, 'Cargo.toml')) return CARGO_CONFIG;

    // 4. Check for Java
    if (await fileExists(rootDir, 'pom.xml')) return MAVEN_CONFIG;
    if (await fileExists(rootDir, 'build.gradle') || await fileExists(rootDir, 'build.gradle.kts')) return GRADLE_CONFIG;

    // 5. Fallback to JS detection
    try {
        const pmName = await detect({ cwd: rootDir });
        if (pmName && pmName in JS_CONFIGS) {
            return JS_CONFIGS[pmName as PackageManagerName];
        }
    } catch (e) {
        // Fallback to npm if detection fails
    }
    return JS_CONFIGS.npm;
}

async function fileExists(dir: string, file: string): Promise<boolean> {
    try {
        await fs.access(path.join(dir, file));
        return true;
    } catch {
        return false;
    }
}

/**
 * Resolves a script command for the detected package manager.
 * e.g. 'test' -> 'npm run test' or 'yarn run test'
 */
export function resolveScriptCommand(pm: PackageManager, scriptName: string): string {
    return pm.runCommand(scriptName);
}

/**
 * Resolves an executable command for the detected package manager.
 * e.g. 'tsc' -> 'npx tsc' or 'yarn dlx tsc'
 */
export function resolveExecCommand(pm: PackageManager, command: string): string {
    return pm.execCommand(command);
}
