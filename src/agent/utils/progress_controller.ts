import { AgentState } from '../state.js';

export interface ProgressSnapshot {
    node: string;
    fileChangeCount: number;
    sameErrorCount: number;
    lastTestSignature?: string;
    functionalChecksCount: number;
    timestamp: number;
}

export interface ProgressAssessment {
    status: 'ok' | 'stuck_candidate';
    reason?: string;
}

/**
 * Creates a lightweight snapshot of the current progress state.
 */
export function makeSnapshot(state: AgentState, currentNode: string): ProgressSnapshot {
    return {
        node: currentNode,
        fileChangeCount: Object.keys(state.fileChanges || {}).length,
        sameErrorCount: state.sameErrorCount || 0,
        lastTestSignature: state.lastTestSignature,
        functionalChecksCount: (state.functionalChecks || []).length,
        timestamp: Date.now()
    };
}

/**
 * Assesses whether the agent is making progress or is stuck in a loop.
 * 
 * Criteria for "stuck":
 * 1. Repeated identical snapshots (same node, same files, same errors) for K steps.
 * 2. High sameErrorCount (already tracked by verifier, but reinforced here).
 */
export function assessProgress(history: ProgressSnapshot[], maxRepeatedSnapshots: number = 3): ProgressAssessment {
    if (history.length < maxRepeatedSnapshots) {
        return { status: 'ok' };
    }

    // Check for repeated snapshots at the end of history
    const recent = history.slice(-maxRepeatedSnapshots);
    const first = recent[0];

    const isStuck = recent.every(snap =>
        snap.node === first.node &&
        snap.fileChangeCount === first.fileChangeCount &&
        snap.sameErrorCount === first.sameErrorCount &&
        snap.lastTestSignature === first.lastTestSignature &&
        snap.functionalChecksCount === first.functionalChecksCount
    );

    if (isStuck) {
        return {
            status: 'stuck_candidate',
            reason: `State has not changed for ${maxRepeatedSnapshots} steps (Node: ${first.node}, Files: ${first.fileChangeCount}, Errors: ${first.sameErrorCount})`
        };
    }

    return { status: 'ok' };
}
