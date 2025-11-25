import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState, ExecutionProfile } from './state.js';
import { KotefConfig } from '../core/config.js';
import { plannerNode } from './nodes/planner.js';
import { researcherNode } from './nodes/researcher.js';
import { coderNode } from './nodes/coder.js';
import { verifierNode } from './nodes/verifier.js';
import { snitchNode } from './nodes/snitch.js';
import { ticketCloserNode } from './nodes/ticket_closer.js';

import { callChat } from '../core/llm.js';

export interface AgentDeps {
    chatFn?: typeof callChat;
}

export function buildKotefGraph(cfg: KotefConfig, deps: AgentDeps = {}) {
    const chatFn = deps.chatFn || callChat;

    // Define the state channels
    const graph = new StateGraph<AgentState>({
        channels: {
            messages: {
                reducer: (a, b) => a.concat(b),
                default: () => [],
            },
            sdd: {
                reducer: (a, b) => ({ ...a, ...b }),
                default: () => ({ project: '', architect: '' }),
            },
            plan: {
                reducer: (a, b) => b, // Latest wins
                default: () => undefined,
            },
            researchResults: {
                reducer: (a, b) => b,
                default: () => undefined,
            },
            fileChanges: {
                reducer: (a, b) => b,
                default: () => undefined,
            },
            testResults: {
                reducer: (a, b) => b,
                default: () => undefined,
            },
            functionalChecks: {
                reducer: (a, b) => (a || []).concat(b || []),
                default: () => [],
            },
            done: {
                reducer: (a, b) => b,
                default: () => false,
            },
            hasSdd: {
                reducer: (a, b) => b,
                default: () => false,
            },
            runProfile: {
                reducer: (a: ExecutionProfile | undefined, b: ExecutionProfile | undefined) => b ?? a,
                default: () => undefined,
            },
            taskScope: {
                reducer: (a, b) => b ?? a,
                default: () => undefined,
            },
            terminalStatus: {
                reducer: (a, b) => b ?? a,
                default: () => undefined,
            },
            loopCounters: {
                reducer: (a, b) => b ?? a,
                default: () => ({
                    planner_to_researcher: 0,
                    planner_to_verifier: 0,
                    planner_to_coder: 0,
                    lastResearchSignature: undefined,
                    lastFileChangeCount: 0,
                    lastTestSignature: undefined
                }),
            },
            totalSteps: {
                reducer: (a, b) => b ?? a,
                default: () => 0,
            },
            lastProgressStep: {
                reducer: (a, b) => b ?? a,
                default: () => undefined,
            },
            consecutiveNoOps: {
                reducer: (a, b) => b ?? a,
                default: () => 0,
            },
            lastTestSignature: {
                reducer: (a, b) => b ?? a,
                default: () => undefined,
            },
            sameErrorCount: {
                reducer: (a, b) => b ?? a,
                default: () => 0,
            },
            progressHistory: {
                reducer: (a, b) => {
                    if (!b) return a;
                    const merged = (a || []).concat(b);
                    // Keep only last 10 snapshots to avoid unbounded growth
                    return merged.slice(-10);
                },
                default: () => [],
            }
        }
    });

    // Add nodes (cast to any to avoid LangGraph.js type inference issues)
    graph.addNode("planner" as any, plannerNode(cfg, chatFn));
    graph.addNode("researcher" as any, researcherNode(cfg));
    graph.addNode("coder" as any, coderNode(cfg, chatFn));
    graph.addNode("verifier" as any, verifierNode(cfg));
    graph.addNode("snitch" as any, snitchNode(cfg));
    graph.addNode("ticket_closer" as any, ticketCloserNode(cfg));

    // Add edges
    graph.addEdge(START, "planner" as any);

    // Planner decides where to go
    graph.addConditionalEdges(
        "planner" as any,
        (state) => {
            const next = (state.plan as any)?.next;

            if (next === 'researcher') {
                const rr: any = state.researchResults;
                const rq = state.researchQuality;

                // Research failed with error
                if (rr && !Array.isArray(rr) && rr.error) {
                    return 'snitch';
                }

                // Use quality metrics for circuit breaking
                if (rq) {
                    // Circuit breaker: prevent infinite research loops
                    if (Array.isArray(rr) && rr.length === 0) {
                        return 'researcher';
                    }
                }

                // Planner explicitly requested more research
                if (Array.isArray(rr) && rr.length > 0) {
                    return 'researcher';
                }

                return 'researcher';
            }

            if (next === 'coder') return 'coder';
            if (next === 'verifier') return 'verifier';
            if (next === 'done') return 'end';
            if (next === 'snitch' || next === 'ask_human') return 'snitch';

            // Fallback: if research already exists, go to coder; else research
            const rr: any = state.researchResults;
            if (Array.isArray(rr) && rr.length > 0) return 'coder';
            return 'researcher';
        },
        {
            researcher: "researcher" as any,
            coder: "coder" as any,
            verifier: "verifier" as any,
            snitch: "snitch" as any,
            end: END
        }
    );

    // Researcher goes back to Planner (to decide next step, e.g. code or more research)
    graph.addEdge("researcher" as any, "planner" as any);

    // Coder goes to Verifier
    graph.addEdge("coder" as any, "verifier" as any);

    // Verifier goes to Planner (if failed) or TicketCloser/End (if passed)
    graph.addConditionalEdges(
        "verifier" as any,
        (state) => {
            if (!state.done) {
                return 'planner';
            }
            const ticketPath = (state.sdd as any)?.ticketPath;
            return ticketPath ? 'ticket_closer' : 'end';
        },
        {
            end: END,
            planner: "planner" as any,
            ticket_closer: "ticket_closer" as any
        }
    );

    // Ticket closer (if any) then terminates the run
    graph.addEdge("ticket_closer" as any, END);

    // Snitch terminates the run after logging an issue
    graph.addEdge("snitch" as any, END);

    return graph.compile();
}
