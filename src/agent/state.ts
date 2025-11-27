import type { ChatMessage } from '../core/llm.js';
import { FetchedPage } from '../tools/fetch_page.js';
import { DetectedCommands } from './utils/verification.js';

export type TaskScope = 'tiny' | 'normal' | 'large';

export interface FunctionalCheck {
    command: string;
    exitCode: number;
    timestamp: number;
    node: 'coder' | 'verifier';
    stdoutSample?: string;
    stderrSample?: string;
}

export interface ClarifiedGoal {
    functional_outcomes: string[];
    non_functional_risks: string[];
    DoD_checks: string[];
    constraints: string[];
}

export interface WorkStep {
    id: string;
    owner: 'planner' | 'coder' | 'researcher' | 'verifier';
    action: string;
    detail: string;
    targets?: string[];
    evidence?: string[];
    risk?: 'low' | 'medium' | 'high';
    budget_estimate?: 'low' | 'medium' | 'high' | number;
}

export interface BudgetAllocation {
    total_tokens?: number;
    total_steps?: number;
    per_step?: Record<string, number>;
}

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

export interface DesignDecision {
    id?: string;
    title: string;
    context: string;
    decision: string;
    alternatives?: string[];
    consequences?: string[];
}

export interface Assumption {
    id?: string;
    area?: string;
    statement: string;
    status: 'tentative' | 'confirmed' | 'rejected';
    source: 'spec' | 'research' | 'guess';
    notes?: string;
}

export interface RiskEntry {
    id: string;
    area: string;
    type: string;
    severity: 'low' | 'medium' | 'high';
    status: 'open' | 'mitigated' | 'accepted' | 'closed';
    description: string;
    mitigation?: string;
    evidence?: string;
    links?: string[];
}

export interface AgentState {
    messages: ChatMessage[];
    designDecisions?: DesignDecision[];
    assumptions?: Assumption[];
    riskEntries?: RiskEntry[];
    sdd: SddContext;
    plan?: any;
    researchResults?: any;
    fileChanges?: Record<string, number | string>;
    // Verification
    detectedCommands?: DetectedCommands;
    testResults?: any;
    /** History of functional probes (e.g. "npm run dev", "python app.py") and their outcomes. */
    functionalChecks?: FunctionalCheck[];
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

    projectSummary?: import('./utils/project_summary.js').ProjectSummary;
    researchQuality?: ResearchQuality;
    metrics?: RunMetrics;
    budget?: BudgetState;
    patchFingerprints?: Map<string, number>;
    gitHotspots?: import('../tools/git.js').GitHotspot[];

    // Flow control
    terminalStatus?: TerminalStatus;
    loopCounters: LoopCounters;
    totalSteps: number;
    lastProgressStep?: number;
    consecutiveNoOps: number; // For coder
    lastTestSignature?: string; // For verifier
    sameErrorCount: number; // For verifier

    /** History of progress snapshots for stuck detection. */
    progressHistory?: import('./utils/progress_controller.js').ProgressSnapshot[];

    /** History of test/lint/build failures and errors. */
    diagnosticsLog?: import('./utils/diagnostics.js').DiagnosticsEntry[];
    /** Concise summary of top diagnostics for prompt injection. */
    diagnosticsSummary?: string;
    /** Flag indicating if code index has been built for this run. */
    codeIndexBuilt?: boolean;

    // Impact & Risk Analysis (Ticket 60)
    impactMap?: {
        files: string[];
        modules: string[];
    };
    riskMap?: {
        level: 'low' | 'medium' | 'high';
        factors: string[];
        hotspots: string[];
    };

    // Context Shaping (Ticket 59)
    contextScan?: {
        cwd: string;
        files: string[];
        gitStatus: string;
        readmeSummary?: string;
    };
    shapedGoal?: {
        appetite: 'Small' | 'Batch' | 'Big';
        nonGoals: string[];
        clarifiedIntent: string;
    };
    clarified_goal?: ClarifiedGoal;
    work_plan?: WorkStep[];
    budget_allocation?: BudgetAllocation;

    // Phase Tracking (Ticket 56)
    currentPhase?: AgentPhase;
    phaseHistory?: PhaseHistoryEntry[];
}

export type AgentPhase =
    | 'understand_goal'
    | 'analyze_system_state'
    | 'design_decide'
    | 'plan_work'
    | 'implement'
    | 'verify'
    | 'refactor'
    | 'document'
    | 'integrate'
    | 'retro';

export interface PhaseHistoryEntry {
    phase: AgentPhase;
    startedAt: number;
    endedAt?: number;
    summary?: string;
}

export type TerminalStatus = 'done_success' | 'done_partial' | 'aborted_stuck' | 'aborted_constraint';

export interface LoopCounters {
    planner_to_researcher: number;
    planner_to_verifier: number;
    planner_to_coder: number;
    planner_to_janitor?: number;
    /** Lightweight fingerprints for progress detection across planner hops. */
    lastResearchSignature?: string;
    lastFileChangeCount?: number;
    lastTestSignature?: string;
}

export interface ResearchQuality {
    lastQuery: string;
    relevance: number;
    confidence: number;
    coverage: number;
    support: number; // 0-1
    recency: number; // 0-1
    diversity: number; // 0-1
    hasConflicts: boolean;
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

export interface BudgetState {
    maxCommands: number;
    maxTestRuns: number;
    maxWebRequests: number;
    commandsUsed: number;
    testRunsUsed: number;
    webRequestsUsed: number;
    commandHistory: Array<{ command: string; timestamp: number }>;
}
