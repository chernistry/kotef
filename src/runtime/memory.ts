import { promises as fs } from 'node:fs';
import path from 'node:path';

import { KotefConfig } from '../core/config.js';

export type MemoryKind = 'episodic' | 'research_receipts' | 'repo_insights' | 'assumptions' | 'verifier_learnings';

export interface MemoryEntry {
    id: string;
    kind: MemoryKind;
    createdAt: string;
    confidence: number;
    source: string;
    summary: string;
    payload: Record<string, unknown>;
}

function getMemoryPath(config: KotefConfig, kind: MemoryKind): string {
    return path.join(config.memoryDir, `${kind}.jsonl`);
}

export async function recordMemoryEntry(config: KotefConfig, entry: MemoryEntry): Promise<void> {
    await fs.mkdir(config.memoryDir, { recursive: true });
    await fs.appendFile(getMemoryPath(config, entry.kind), `${JSON.stringify(entry)}\n`, 'utf8');
}
