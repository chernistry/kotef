import { AgentState, AgentPhase, PhaseHistoryEntry } from '../state.js';
import { createLogger } from '../../core/logger.js';

const log = createLogger('phase_tracker');

/**
 * Transition the agent to a new phase.
 * Updates currentPhase and appends to phaseHistory.
 * 
 * @param state - Current agent state
 * @param newPhase - The phase to transition to
 * @param summary - Optional summary of the previous phase or context for the new one
 * @returns Updated partial state
 */
export function transitionPhase(state: AgentState, newPhase: AgentPhase, summary?: string): Partial<AgentState> {
    const now = Date.now();
    const history = [...(state.phaseHistory || [])];

    // Close previous phase if exists
    if (history.length > 0) {
        const lastEntry = history[history.length - 1];
        if (!lastEntry.endedAt) {
            lastEntry.endedAt = now;
            if (summary && !lastEntry.summary) {
                lastEntry.summary = summary; // Attach summary to the closing phase
            }
        }
    }

    // Don't add a new entry if we're just staying in the same phase (unless forced, but here we dedup)
    if (state.currentPhase === newPhase) {
        return {};
    }

    log.info(`Transitioning phase: ${state.currentPhase} -> ${newPhase}`);

    // Start new phase
    const newEntry: PhaseHistoryEntry = {
        phase: newPhase,
        startedAt: now
    };

    return {
        currentPhase: newPhase,
        phaseHistory: [...history, newEntry]
    };
}

/**
 * Get the duration of the current or last completed phase in seconds.
 */
export function getPhaseDuration(entry: PhaseHistoryEntry): number {
    const end = entry.endedAt || Date.now();
    return (end - entry.startedAt) / 1000;
}
