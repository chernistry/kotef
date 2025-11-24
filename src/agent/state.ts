import type { ChatMessage } from '../core/llm.js';
import type { TaskScope } from './task_scope.js';

export interface SddContext {
    /** Optional natural-language goal that triggered this run. */
    goal?: string;
    project: string;       // raw text from .sdd/project.md
    architect: string;     // raw text from .sdd/architect.md
    bestPractices?: string;
    ticket?: string;       // current ticket markdown
    issues?: string;       // issues encountered
}

export type ExecutionProfile = 'strict' | 'fast' | 'smoke' | 'yolo';

export interface AgentState {
    messages: ChatMessage[];
    sdd: SddContext;
    plan?: any;
    researchResults?: any;
    fileChanges?: Record<string, string>;
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
}
