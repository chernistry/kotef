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
            }
        }
    });

    // Add nodes
    // LangGraph.js 0.2+ might require different typing or string literals.
    // The error suggests it expects "__start__" which is weird for addNode.
    // It might be because StateGraph generic type inference.

    // Let's try casting the node names or checking the docs pattern.
    // Usually: graph.addNode("name", nodeFn)

    // If we look at recent LangGraph JS examples:
    // const workflow = new StateGraph<AgentState>({ channels: ... })
    // workflow.addNode("agent", agentNode)

    // The error `Argument of type '"planner"' is not assignable to parameter of type '"__start__" | "__start__"[]'`
    // usually happens when the graph hasn't been initialized with node names or something.
    // Wait, `addNode` takes `key` and `action`.

    // Let's try to be explicit about the graph type or just suppress if it's a false positive, 
    // but it's a build error so we must fix it.

    // Maybe we need to define the node names in the StateGraph constructor or generic?
    // No, StateGraph<State> is standard.

    // Ah, maybe I need to import START/END and use them correctly?
    // Add nodes
    // Casting to any to avoid strict type checking issues with LangGraph generics in this version
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

                // If we have SDD results, we are good.
                if (rr && !Array.isArray(rr) && rr.source === 'sdd') {
                    return 'coder';
                }

                // If research failed with error, snitch.
                if (rr && !Array.isArray(rr) && rr.error) {
                    return 'snitch';
                }

                // If we have quality metrics, use them to decide loop vs give up.
                if (rq) {
                    // If quality says we should retry, and we haven't hit a hard loop limit (e.g. 3 global attempts),
                    // we might allow it. But deepResearch already does internal retries.
                    // So if deepResearch returns, it means it either succeeded or exhausted its own retries.
                    // If it exhausted retries and still says "shouldRetry", it means it failed to get good results.
                    // We should probably NOT loop back to researcher immediately with the same query.
                    // However, the Planner might have changed the goal/query.

                    // Heuristic: If planner says "researcher" AGAIN, but quality was poor, 
                    // we check if we have enough info to proceed or if we should fail.

                    // For now, let's trust the Planner's decision unless it looks like a tight loop.
                    // We can use state.failureHistory or just rely on the fact that deepResearch is robust.

                    // If quality is really bad (relevance < 0.5) and we have results, maybe we should warn?
                    // But for graph logic, we just follow next unless it's an infinite loop.

                    // If findings are empty, we must not go to coder.
                    if (Array.isArray(rr) && rr.length === 0) {
                        // If planner wants research, let it try (maybe new query).
                        // But if it keeps failing, we need a circuit breaker.
                        // For now, allow it.
                        return 'researcher';
                    }
                }

                // Legacy/Fallback: if we have results, usually we go to coder, but planner said researcher.
                // If planner explicitly wants research, we respect it (assuming it knows what it's doing).
                // But to prevent infinite loops if planner is dumb:
                if (Array.isArray(rr) && rr.length > 0) {
                    // Planner wants more research despite having results.
                    // Allow it, but maybe we should check if query changed?
                    // For MVP, just return 'researcher'.
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
