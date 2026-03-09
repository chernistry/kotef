import { promises as fs } from 'node:fs';
import path from 'node:path';

import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

import { KotefConfig } from '../core/config.js';

const checkpointerCache = new Map<string, SqliteSaver>();

export function getCheckpointDbPath(config: KotefConfig): string {
    return path.join(config.runtimeDir, 'kotef.sqlite');
}

export async function getSqliteCheckpointer(config: KotefConfig): Promise<SqliteSaver> {
    const dbPath = getCheckpointDbPath(config);
    const cached = checkpointerCache.get(dbPath);
    if (cached) {
        return cached;
    }

    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    const saver = SqliteSaver.fromConnString(dbPath);
    checkpointerCache.set(dbPath, saver);
    return saver;
}
