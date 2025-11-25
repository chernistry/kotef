import { detect } from 'detect-package-manager';
import path from 'node:path';

export type PackageManagerName = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface PackageManager {
    name: PackageManagerName;
    installCommand: string;
    runCommand: (script: string) => string;
    execCommand: (command: string) => string;
}

const PM_CONFIGS: Record<PackageManagerName, PackageManager> = {
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
        execCommand: (command) => `yarn dlx ${command}` // or yarn exec, but dlx is closer to npx
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

/**
 * Detects the package manager used in the given root directory.
 * Defaults to 'npm' if detection fails.
 */
export async function detectPackageManager(rootDir: string): Promise<PackageManager> {
    try {
        const pmName = await detect({ cwd: rootDir });
        // detect-package-manager returns 'npm', 'yarn', 'pnpm', 'bun'
        // Type assertion is safe because we check against our config keys
        if (pmName && pmName in PM_CONFIGS) {
            return PM_CONFIGS[pmName as PackageManagerName];
        }
    } catch (e) {
        // Fallback to npm if detection fails (e.g. no lockfile)
    }
    return PM_CONFIGS.npm;
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
