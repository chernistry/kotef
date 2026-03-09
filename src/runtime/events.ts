import { promises as fs } from 'node:fs';
import path from 'node:path';

import { KotefConfig } from '../core/config.js';

export type KotefRunEventType =
    | 'run.started'
    | 'llm.started'
    | 'llm.completed'
    | 'tool.started'
    | 'tool.completed'
    | 'checkpoint.saved'
    | 'interrupt.raised'
    | 'interrupt.resumed'
    | 'eval.recorded'
    | 'run.finished';

export interface KotefRunEvent {
    type: KotefRunEventType;
    runId: string;
    threadId: string;
    timestamp: string;
    payload?: Record<string, unknown>;
}

export type RuntimeEventSink = (type: KotefRunEventType, payload?: Record<string, unknown>) => Promise<void>;

function getEventPath(config: KotefConfig, threadId: string): string {
    return path.join(config.eventsDir, `${threadId}.jsonl`);
}

export class RuntimeEventLogger {
    constructor(
        private readonly config: KotefConfig,
        private readonly runId: string,
        private readonly threadId: string,
    ) { }

    async emit(type: KotefRunEventType, payload: Record<string, unknown> = {}): Promise<void> {
        await fs.mkdir(this.config.eventsDir, { recursive: true });
        const event: KotefRunEvent = {
            type,
            runId: this.runId,
            threadId: this.threadId,
            timestamp: new Date().toISOString(),
            payload,
        };
        await fs.appendFile(getEventPath(this.config, this.threadId), `${JSON.stringify(event)}\n`, 'utf8');
    }

    static async readEvents(config: KotefConfig, threadId: string): Promise<KotefRunEvent[]> {
        try {
            const raw = await fs.readFile(getEventPath(config, threadId), 'utf8');
            return raw
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map(line => JSON.parse(line) as KotefRunEvent);
        } catch {
            return [];
        }
    }
}
