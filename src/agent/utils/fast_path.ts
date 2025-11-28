/**
 * Fast Path: Skip unnecessary cycles for low-risk changes (Ticket 08)
 */

import type { AgentState, ExecutionProfile } from '../state.js';

interface FastPathConfig {
    maxFilesChanged: number;
    requireTestsPass: boolean;
    requireNoErrors: boolean;
}

const FAST_PATH_CONFIG: Record<ExecutionProfile, FastPathConfig | null> = {
    strict: null,  // No fast path
    fast: null,    // No fast path
    smoke: { maxFilesChanged: 3, requireTestsPass: true, requireNoErrors: true },
    yolo: { maxFilesChanged: 5, requireTestsPass: false, requireNoErrors: false }
};

/**
 * Check if fast path can be used to skip planner re-evaluation
 */
export function canUseFastPath(state: AgentState): boolean {
    const profile = state.runProfile || 'fast';
    const config = FAST_PATH_CONFIG[profile];

    if (!config) return false;

    const filesChanged = Object.keys(state.fileChanges || {}).length;
    if (filesChanged > config.maxFilesChanged) return false;
    if (filesChanged === 0) return false; // No changes = nothing to fast-path

    if (config.requireTestsPass && !state.testResults?.passed) return false;

    if (config.requireNoErrors) {
        const hasErrors = state.diagnosticsLog?.some(d => d.source === 'build' || d.source === 'test');
        if (hasErrors) return false;
    }

    return true;
}
