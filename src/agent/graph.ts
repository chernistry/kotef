import { StateGraph, END, START } from '@langchain/langgraph';
import { AgentState } from './state.js';
import { KotefConfig } from '../core/config.js';
import { plannerNode } from './nodes/planner.js';
import { researcherNode } from './nodes/researcher.js';
import { coderNode } from './nodes/coder.js';
import { verifierNode } from './nodes/verifier.js';

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

    // Add edges
    graph.addEdge(START, "planner" as any);

    // Planner decides where to go
    graph.addConditionalEdges(
        "planner" as any,
        (state) => {
            const next = (state.plan as any)?.next;
            if (next === 'researcher') return 'researcher';
            if (next === 'coder') return 'coder';
            if (next === 'verifier') return 'verifier';
            if (next === 'done') return 'end';
            return 'researcher'; // Default
        },
        {
            researcher: "researcher" as any,
            coder: "coder" as any,
            verifier: "verifier" as any,
            end: END
        }
    );

    // Researcher goes back to Planner (to decide next step, e.g. code or more research)
    graph.addEdge("researcher" as any, "planner" as any);

    // Coder goes to Verifier
    graph.addEdge("coder" as any, "verifier" as any);

    // Verifier goes to Planner (if failed) or End (if passed)
    graph.addConditionalEdges(
        "verifier" as any,
        (state) => state.done ? "end" : "planner",
        {
            end: END,
            planner: "planner" as any
        }
    );

    return graph.compile();
}
