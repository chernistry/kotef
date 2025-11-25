/**
 * Progress Controller - Supervisor-level progress tracking and stuck state detection.
 * 
 * This module provides utilities for tracking agent progress across runs and detecting
 * when the agent is stuck in a loop or making no forward progress.
 * 
 * ## Architecture
 * 
 * The progress controller uses lightweight snapshots to track:
 * - File changes count
 * - Error repetition count
 * - Test output signatures
 * - Functional check counts
 * 
 * When snapshots remain identical for N consecutive steps (default: 3), the agent
 * is marked as a "stuck candidate" and the planner routes to an aborted state.
 * 
 * ## Integration
 * 
 * - `plannerNode` calls `makeSnapshot` at the start of each cycle
 * - `assessProgress` is called with the full history to detect stuck states
 * - When stuck, planner sets `terminalStatus: 'aborted_stuck'` and routes to `snitch`
 * 
 * ## Configuration
 * 
 * Default thresholds (see architect.md § 12. Progress & Stop Rules):
 * - MAX_REPEATED_SNAPSHOTS: 3
 * - MAX_STEPS: 50
 * - MAX_PLANNER_TO_* loop counters: 5 each
 * 
 * @module progress_controller
 */

import { AgentState } from '../state.js';

/**
 * Lightweight snapshot of agent progress at a point in time.
 * 
 * Used to detect when the agent is stuck by comparing consecutive snapshots.
 */
export interface ProgressSnapshot {
    /** Node that created this snapshot (e.g., 'planner', 'coder', 'verifier') */
    node: string;
    /** Number of files changed so far in this run */
    fileChangeCount: number;
    /** Number of consecutive identical errors */
    sameErrorCount: number;
    /** Hash or signature of last test output (for deduplication) */
    lastTestSignature?: string;
    /** Number of functional checks (probes) executed */
    functionalChecksCount: number;
    /** Timestamp when this snapshot was created */
    timestamp: number;
}

/**
 * Result of progress assessment.
 */
export interface ProgressAssessment {
    /** 'ok' if making progress, 'stuck_candidate' if potentially stuck */
    status: 'ok' | 'stuck_candidate';
    /** Human-readable explanation if stuck */
    reason?: string;
}

/**
 * Creates a lightweight snapshot of the current progress state.
 * 
 * @param state Current agent state
 * @param currentNode Node creating the snapshot (e.g., 'planner')
 * @returns Progress snapshot for this moment
 * 
 * @example
 * ```typescript
 * const snapshot = makeSnapshot(state, 'planner');
 * const history = [...(state.progressHistory || []), snapshot];
 * state.progressHistory = history;
 * ```
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
 * 
 * @param history Array of progress snapshots (typically from `state.progressHistory`)
 * @param maxRepeatedSnapshots Number of identical snapshots before marking as stuck (default: 3)
 * @returns Assessment indicating whether progress is being made
 * 
 * @example
 * ```typescript
 * const assessment = assessProgress(state.progressHistory || [], 3);
 * if (assessment.status === 'stuck_candidate') {
 *     log.warn('Agent appears stuck', { reason: assessment.reason });
 *     // Route to snitch or abort
 * }
 * ```
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

