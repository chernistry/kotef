import type { ChatMessage } from '../core/llm.js';

export interface SddContext {
    /** Optional natural-language goal that triggered this run. */
    goal?: string;
    project: string;       // raw text from .sdd/project.md
    architect: string;     // raw text from .sdd/architect.md
    bestPractices?: string;
    ticket?: string;       // current ticket markdown
}

export interface AgentState {
    messages: ChatMessage[];
    sdd: SddContext;
    plan?: unknown;        // later refined
    researchResults?: unknown;
    fileChanges?: unknown;
    testResults?: unknown;
    done?: boolean;
    /** Internal flag to distinguish between bootstrap vs normal ticket execution. */
    hasSdd?: boolean;
}
