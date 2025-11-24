import { AgentState, ExecutionProfile } from './state.js';

export type { ExecutionProfile };

export interface CommandPolicy {
    maxCommands: number;
    maxTestRuns: number;
    allowPackageInstalls: boolean;
    allowAppRun: boolean; // flet run / npm start
}

export const PROFILE_POLICIES: Record<ExecutionProfile, CommandPolicy> = {
    strict: { maxCommands: 20, maxTestRuns: 5, allowPackageInstalls: true, allowAppRun: true },
    fast: { maxCommands: 8, maxTestRuns: 3, allowPackageInstalls: false, allowAppRun: true },
    smoke: { maxCommands: 3, maxTestRuns: 1, allowPackageInstalls: false, allowAppRun: false },
    yolo: { maxCommands: 15, maxTestRuns: 4, allowPackageInstalls: true, allowAppRun: true },
};

export function resolveExecutionProfile(state: AgentState): ExecutionProfile {
    if (state.runProfile && PROFILE_POLICIES[state.runProfile]) {
        return state.runProfile;
    }
    // Default fallback
    return 'fast';
}

export function looksLikeInstall(command: string): boolean {
    const cmd = command.trim().toLowerCase();
    return (
        cmd.startsWith('npm install') ||
        cmd.startsWith('npm i ') ||
        cmd.startsWith('pnpm add') ||
        cmd.startsWith('pnpm install') ||
        cmd.startsWith('yarn add') ||
        cmd.startsWith('pip install') ||
        cmd.startsWith('pip3 install') ||
        cmd.startsWith('poetry add') ||
        cmd.startsWith('go get') ||
        cmd.startsWith('cargo add')
    );
}

export function looksLikeHeavyCommand(command: string): boolean {
    const cmd = command.trim().toLowerCase();
    return (
        cmd.includes('playwright install') ||
        cmd.includes('flet run') ||
        cmd.includes('npm start') ||
        cmd.includes('react-scripts start') ||
        cmd.includes('next dev')
    );
}
