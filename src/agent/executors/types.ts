/**
 * Executor Interface: Abstraction for code-editing backends (Ticket 05)
 */

import type { IntentContract } from '../state.js';

export interface ExecutorRequest {
    rootDir: string;
    intent: IntentContract | null;
    ticketMarkdown?: string;
    summary?: string;
    targetFiles?: string[];
    /** Additional context for the executor */
    context?: {
        architect?: string;
        bestPractices?: string;
        projectSummary?: string;
        riskSummary?: string;
        impactSummary?: string;
    };
}

export interface ExecutorResult {
    changedFiles: string[];
    logs?: string[];
    error?: string;
    success: boolean;
}

/**
 * Executor interface for pluggable code-editing backends
 */
export interface Executor {
    name: string;
    execute(request: ExecutorRequest): Promise<ExecutorResult>;
}
