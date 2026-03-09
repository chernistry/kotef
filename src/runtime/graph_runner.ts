import { randomUUID } from 'node:crypto';

import { Command, StateSnapshot, isInterrupted } from '@langchain/langgraph';

import { buildKotefGraph } from '../agent/graph.js';
import { AgentState } from '../agent/state.js';
import { callChat, ChatCompletionOptions, ChatMessage } from '../core/llm.js';
import { KotefConfig } from '../core/config.js';
import { getSqliteCheckpointer } from './checkpointer.js';
import { RuntimeEventLogger } from './events.js';
import { recordMemoryEntry } from './memory.js';

export interface RunGraphOptions {
    initialState?: Partial<AgentState>;
    threadId?: string;
    runId?: string;
    recursionLimit?: number;
    resume?: unknown;
}

export interface RunGraphResult {
    runId: string;
    threadId: string;
    result: unknown;
    interrupted: boolean;
    snapshot?: StateSnapshot;
}

function seedRunControl(state: Partial<AgentState> | undefined, runId: string, threadId: string, cfg: KotefConfig): Partial<AgentState> {
    return {
        ...state,
        runControl: {
            ...state?.runControl,
            runId,
            threadId,
            approvalMode: cfg.approvalMode,
            startedAt: state?.runControl?.startedAt ?? Date.now(),
        }
    };
}

export async function runAgentGraph(cfg: KotefConfig, options: RunGraphOptions): Promise<RunGraphResult> {
    const runId = options.runId ?? randomUUID();
    const threadId = options.threadId ?? randomUUID();
    const eventLogger = new RuntimeEventLogger(cfg, runId, threadId);
    const checkpointer = await getSqliteCheckpointer(cfg);

    const instrumentedChat = async (
        runtimeConfig: KotefConfig,
        messages: ChatMessage[],
        llmOptions: ChatCompletionOptions = {}
    ) => {
        await eventLogger.emit('llm.started', {
            model: llmOptions.model ?? runtimeConfig.modelFast,
            messageCount: messages.length,
        });

        const result = await callChat(runtimeConfig, messages, {
            ...llmOptions,
            onEvent: async (event) => {
                if (llmOptions.onEvent) {
                    await llmOptions.onEvent(event);
                }
            }
        });

        await eventLogger.emit('llm.completed', {
            model: llmOptions.model ?? runtimeConfig.modelFast,
            responseId: result.responseId,
            totalTokens: result.usage?.totalTokens,
            toolCallCount: result.toolCalls?.length ?? 0,
        });

        return result;
    };

    const eventSink = async (type: 'tool.started' | 'tool.completed', payload: Record<string, unknown> = {}) => {
        await eventLogger.emit(type, payload);
    };

    const graph = buildKotefGraph(cfg, {
        chatFn: instrumentedChat,
        checkpointer,
        eventSink,
    });

    await eventLogger.emit('run.started', {
        approvalMode: cfg.approvalMode,
        goal: options.initialState?.sdd?.goal,
        ticketId: options.initialState?.sdd?.ticketId,
    });
    if (options.resume !== undefined) {
        await eventLogger.emit('interrupt.resumed', {
            resume: options.resume as Record<string, unknown>,
        });
    }

    const runnableConfig = {
        configurable: {
            thread_id: threadId,
        },
        recursionLimit: options.recursionLimit ?? 100,
        durability: 'sync' as const,
    };

    const input = options.resume !== undefined
        ? new Command({ resume: options.resume })
        : seedRunControl(options.initialState, runId, threadId, cfg);

    const result = await graph.invoke(input as any, runnableConfig as any);
    const interrupted = isInterrupted(result);

    if (interrupted) {
        await eventLogger.emit('interrupt.raised', {
            interrupts: (result as any).__interrupt__,
        });
    }

    const snapshot = await graph.getState(runnableConfig as any);
    await eventLogger.emit('checkpoint.saved', {
        checkpointId: snapshot.config.configurable?.checkpoint_id,
        next: snapshot.next,
    });

    await recordMemoryEntry(cfg, {
        id: runId,
        kind: 'episodic',
        createdAt: new Date().toISOString(),
        confidence: 1,
        source: 'runtime',
        summary: interrupted ? 'Run interrupted for resume' : 'Run completed',
        payload: {
            threadId,
            checkpointId: snapshot.config.configurable?.checkpoint_id,
            next: snapshot.next,
        },
    });

    if (!interrupted) {
        await eventLogger.emit('run.finished', {
            interrupted: false,
            checkpointId: snapshot.config.configurable?.checkpoint_id,
        });
    }

    return {
        runId,
        threadId,
        result,
        interrupted,
        snapshot,
    };
}

export async function inspectAgentRun(cfg: KotefConfig, threadId: string): Promise<{
    snapshot?: StateSnapshot;
    history: StateSnapshot[];
    events: Awaited<ReturnType<typeof RuntimeEventLogger.readEvents>>;
}> {
    const checkpointer = await getSqliteCheckpointer(cfg);
    const graph = buildKotefGraph(cfg, { checkpointer });
    const runnableConfig = { configurable: { thread_id: threadId } };

    const history: StateSnapshot[] = [];
    for await (const item of graph.getStateHistory(runnableConfig as any)) {
        history.push(item);
    }

    return {
        snapshot: await graph.getState(runnableConfig as any).catch(() => undefined),
        history,
        events: await RuntimeEventLogger.readEvents(cfg, threadId),
    };
}
