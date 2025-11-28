/**
 * Simple Project Memory: Cross-run learning (Ticket 04)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface RunSummary {
    timestamp: string;
    ticketId?: string;
    goal: string;
    outcome: 'success' | 'partial' | 'failed';
    lesson: string;
}

export interface ProjectMemory {
    runs: RunSummary[];
    notes: string[];
}

const MEMORY_FILE = 'project_memory.json';
const MAX_RUNS = 20;

/**
 * Load project memory from .sdd/cache/
 */
export async function loadProjectMemory(rootDir: string): Promise<ProjectMemory | null> {
    const memoryPath = path.join(rootDir, '.sdd', 'cache', MEMORY_FILE);
    try {
        const content = await fs.readFile(memoryPath, 'utf-8');
        return JSON.parse(content) as ProjectMemory;
    } catch {
        return null;
    }
}

/**
 * Append a run summary to project memory
 */
export async function appendRunSummary(rootDir: string, summary: RunSummary): Promise<void> {
    const cacheDir = path.join(rootDir, '.sdd', 'cache');
    await fs.mkdir(cacheDir, { recursive: true });
    const memoryPath = path.join(cacheDir, MEMORY_FILE);

    let memory: ProjectMemory = { runs: [], notes: [] };
    try {
        const content = await fs.readFile(memoryPath, 'utf-8');
        memory = JSON.parse(content);
    } catch {
        // File doesn't exist, start fresh
    }

    memory.runs.push(summary);

    // Keep only last MAX_RUNS
    if (memory.runs.length > MAX_RUNS) {
        memory.runs = memory.runs.slice(-MAX_RUNS);
    }

    await fs.writeFile(memoryPath, JSON.stringify(memory, null, 2));
}

/**
 * Format memory for prompt injection
 */
export function formatMemoryForPrompt(memory: ProjectMemory, maxLines: number = 5): string {
    if (!memory || memory.runs.length === 0) {
        return 'No previous runs recorded.';
    }

    const recent = memory.runs.slice(-maxLines);
    const lines = recent.map(r => {
        const ticket = r.ticketId ? `[${r.ticketId}]` : '';
        const icon = r.outcome === 'success' ? '✓' : r.outcome === 'partial' ? '~' : '✗';
        return `${icon} ${ticket} ${r.goal.slice(0, 50)}${r.goal.length > 50 ? '...' : ''} → ${r.lesson}`;
    });

    return `Recent runs:\n${lines.join('\n')}`;
}
