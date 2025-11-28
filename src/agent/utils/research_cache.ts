/**
 * Research Cache: Reuse SDD deep research at runtime (Ticket 03)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DeepResearchFinding } from '../../tools/deep_research.js';

/** Subset of ResearchQuality relevant for caching */
export interface CachedResearchQuality {
    relevance: number;
    confidence: number;
    coverage: number;
    support: number;
    recency: number;
    diversity: number;
    hasConflicts: boolean;
    shouldRetry: boolean;
    reasons: string;
}

export interface ResearchCacheEntry {
    goal: string;
    query: string;
    findings: DeepResearchFinding[];
    quality?: CachedResearchQuality;
    updatedAt: number;
}

const CACHE_FILE = 'research_cache.json';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Load research cache from .sdd/cache/
 */
export async function loadResearchCache(rootDir: string): Promise<ResearchCacheEntry[] | null> {
    const cachePath = path.join(rootDir, '.sdd', 'cache', CACHE_FILE);
    try {
        const content = await fs.readFile(cachePath, 'utf-8');
        const entries = JSON.parse(content) as ResearchCacheEntry[];
        // Filter out stale entries
        const now = Date.now();
        return entries.filter(e => (now - e.updatedAt) < CACHE_MAX_AGE_MS);
    } catch {
        return null;
    }
}

/**
 * Save research cache entry
 */
export async function saveResearchCache(rootDir: string, entry: ResearchCacheEntry): Promise<void> {
    const cacheDir = path.join(rootDir, '.sdd', 'cache');
    await fs.mkdir(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, CACHE_FILE);

    // Load existing entries and update/append
    let entries: ResearchCacheEntry[] = [];
    try {
        const content = await fs.readFile(cachePath, 'utf-8');
        entries = JSON.parse(content);
    } catch {
        // File doesn't exist, start fresh
    }

    // Replace entry with same goal or append
    const existingIdx = entries.findIndex(e => e.goal === entry.goal);
    if (existingIdx >= 0) {
        entries[existingIdx] = entry;
    } else {
        entries.push(entry);
    }

    // Keep only last 5 entries to avoid unbounded growth
    if (entries.length > 5) {
        entries = entries.slice(-5);
    }

    await fs.writeFile(cachePath, JSON.stringify(entries, null, 2));
}

/**
 * Match a runtime goal to cached research using simple heuristics
 */
export function matchGoalToCache(goal: string, entries: ResearchCacheEntry[]): ResearchCacheEntry | null {
    if (!goal || !entries || entries.length === 0) return null;

    const normalizedGoal = goal.toLowerCase().trim();

    for (const entry of entries) {
        const normalizedCached = entry.goal.toLowerCase().trim();

        // Exact match
        if (normalizedGoal === normalizedCached) {
            return entry;
        }

        // Substring match (goal contains cached or vice versa)
        if (normalizedGoal.includes(normalizedCached) || normalizedCached.includes(normalizedGoal)) {
            return entry;
        }

        // Ticket ID match (e.g., "01-setup" in both)
        const ticketIdPattern = /\b(\d{2}-[a-z-]+)/i;
        const goalTicket = normalizedGoal.match(ticketIdPattern)?.[1];
        const cachedTicket = normalizedCached.match(ticketIdPattern)?.[1];
        if (goalTicket && cachedTicket && goalTicket === cachedTicket) {
            return entry;
        }

        // Significant word overlap (>50% of words match)
        const goalWords = new Set(normalizedGoal.split(/\s+/).filter(w => w.length > 3));
        const cachedWords = new Set(normalizedCached.split(/\s+/).filter(w => w.length > 3));
        if (goalWords.size > 0 && cachedWords.size > 0) {
            const intersection = [...goalWords].filter(w => cachedWords.has(w));
            const overlapRatio = intersection.length / Math.min(goalWords.size, cachedWords.size);
            if (overlapRatio > 0.5) {
                return entry;
            }
        }
    }

    return null;
}
