import type { ChatMessage } from '../core/llm.js';
import { FetchedPage } from '../tools/fetch_page.js';
import { DetectedCommands } from './utils/verification.js';

export type TaskScope = 'tiny' | 'normal' | 'large';

export interface SddContext {
    /** Optional natural-language goal that triggered this run. */
    goal?: string;
    project: string;       // raw text from .sdd/project.md
    architect: string;     // raw text from .sdd/architect.md
    bestPractices?: string;
    ticket?: string;       // current ticket markdown
    ticketPath?: string;   // absolute path to current ticket file (in backlog/tickets/open)
    ticketId?: string;     // simple identifier like "17-goal-aware-verification"
    issues?: string;       // issues encountered
}

export type ExecutionProfile = 'strict' | 'fast' | 'smoke' | 'yolo';

export interface AgentState {
    messages: ChatMessage[];
    sdd: SddContext;
    plan?: any;
    researchResults?: any;
    fileChanges?: Record<string, string>;
    // Verification
    detectedCommands?: DetectedCommands;
    testResults?: any;
    /** History of failures encountered during this run, for loop detection. */
    failureHistory?: Array<{
        step: string;
        error: string;
        timestamp: number;
    }>;
    done?: boolean;
    /** Internal flag to distinguish between bootstrap vs normal ticket execution. */
    hasSdd?: boolean;
    /** Execution profile for this run: affects how heavy tests/checks should be. */
    runProfile?: ExecutionProfile;
    /** Rough heuristic of task size to guide profiles and command limits. */
    taskScope?: TaskScope;
    /** Precomputed SDD summaries for token optimization. */
    sddSummaries?: {
        projectSummary: string;
        architectSummary: string;
        bestPracticesSummary: string;
    };
    researchQuality?: ResearchQuality;
    metrics?: RunMetrics;

    // Flow control
    terminalStatus?: TerminalStatus;
    loopCounters: LoopCounters;
    totalSteps: number;
    lastProgressStep?: number;
    consecutiveNoOps: number; // For coder
    lastTestSignature?: string; // For verifier
    sameErrorCount: number; // For verifier
}

export type TerminalStatus = 'done_success' | 'done_partial' | 'aborted_stuck' | 'aborted_constraint';

export interface LoopCounters {
    planner_to_researcher: number;
    planner_to_verifier: number;
    planner_to_coder: number;
}

export interface ResearchQuality {
    lastQuery: string;
    relevance: number;
    confidence: number;
    coverage: number;
    shouldRetry: boolean;
    reasons: string;
    attemptCount: number;
}

export interface RunMetrics {
    toolCalls: number;
    llmCalls: number;
    totalTokens: number;
    startTime: number;
    endTime?: number;
}
