/**
 * Intent Contract: captures goal, constraints, appetite, non-goals, and DoD in one place.
 * Built by LLM during SDD orchestration and cached for runtime use.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface IntentContract {
    goal: string;
    ticketId?: string;
    appetite: 'Small' | 'Batch' | 'Big';
    nonGoals: string[];
    constraints: string[];      // "DO NOT...", "Never...", etc.
    dodChecks: string[];        // Commands/conditions for done
    forbiddenPaths?: string[];  // From KOTEF.md
}

/**
 * Parse DoD checks from ticket or goal text
 */
function parseDodChecks(text: string): string[] {
    if (!text) return [];
    const dodMatch = text.match(/(?:Definition of Done|DoD|## DoD)[:\s]*\n([\s\S]*?)(?=\n##|$)/i);
    if (dodMatch) {
        return dodMatch[1]
            .split('\n')
            .map(l => l.replace(/^[-*\[\]x ]+/i, '').trim())
            .filter(l => l && !l.startsWith('#'));
    }
    const checkboxes = text.match(/^[-*]\s*\[[ x]\]\s*.+$/gim);
    return checkboxes?.map(l => l.replace(/^[-*]\s*\[[ x]\]\s*/, '').trim()) || [];
}

/**
 * Parse forbidden paths from KOTEF.md
 */
function parseForbiddenPaths(kotefText: string): string[] {
    if (!kotefText) return [];
    const match = kotefText.match(/## Forbidden Paths\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (!match) return [];
    return match[1]
        .split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(l => l && !l.startsWith('#'));
}

export interface BuildIntentParams {
    goal?: string;
    ticketMarkdown?: string;
    shapedGoal?: { appetite: 'Small' | 'Batch' | 'Big'; nonGoals: string[]; clarifiedIntent: string };
    clarifiedGoal?: { functional_outcomes: string[]; non_functional_risks: string[]; DoD_checks: string[]; constraints: string[] };
    kotefText?: string;
}

/**
 * Build an IntentContract from available sources.
 * Prefers AI-generated scope analysis from cache if available.
 */
export function buildIntentContract(params: BuildIntentParams): IntentContract {
    const { goal, ticketMarkdown, shapedGoal, clarifiedGoal, kotefText } = params;

    const dodChecks = [
        ...parseDodChecks(ticketMarkdown || ''),
        ...(clarifiedGoal?.DoD_checks || [])
    ];

    const constraints = clarifiedGoal?.constraints || [];

    return {
        goal: goal || shapedGoal?.clarifiedIntent || '',
        ticketId: ticketMarkdown?.match(/^# Ticket:\s*(\S+)/m)?.[1],
        appetite: shapedGoal?.appetite || 'Batch',
        nonGoals: shapedGoal?.nonGoals || [],
        constraints: [...new Set(constraints)],
        dodChecks: [...new Set(dodChecks)],
        forbiddenPaths: parseForbiddenPaths(kotefText || '')
    };
}

/**
 * Load KOTEF.md from project root
 */
export async function loadKotefConfig(rootDir: string): Promise<string> {
    const kotefPath = path.join(rootDir, '.sdd', 'KOTEF.md');
    try {
        return await fs.readFile(kotefPath, 'utf-8');
    } catch {
        return '';
    }
}

/**
 * Summarize intent contract for prompt injection
 */
export function summarizeIntent(contract: IntentContract): string {
    const parts = [
        `Goal: ${contract.goal}`,
        `Appetite: ${contract.appetite}`,
    ];
    if (contract.ticketId) parts.push(`Ticket: ${contract.ticketId}`);
    if (contract.nonGoals.length) parts.push(`Non-Goals: ${contract.nonGoals.join('; ')}`);
    if (contract.constraints.length) parts.push(`Constraints: ${contract.constraints.join('; ')}`);
    if (contract.dodChecks.length) parts.push(`DoD Checks: ${contract.dodChecks.slice(0, 5).join('; ')}`);
    if (contract.forbiddenPaths?.length) parts.push(`Forbidden Paths: ${contract.forbiddenPaths.join(', ')}`);
    return parts.join('\n');
}

/**
 * Save intent contract to cache for cross-run reuse
 */
export async function saveIntentContract(rootDir: string, contract: IntentContract): Promise<void> {
    const cacheDir = path.join(rootDir, '.sdd', 'cache');
    await fs.mkdir(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, 'intent_contract.json');
    await fs.writeFile(cachePath, JSON.stringify(contract, null, 2));
}

/**
 * Load cached intent contract if it exists and matches current goal
 */
export async function loadCachedIntentContract(rootDir: string, currentGoal?: string): Promise<IntentContract | null> {
    const cachePath = path.join(rootDir, '.sdd', 'cache', 'intent_contract.json');
    try {
        const content = await fs.readFile(cachePath, 'utf-8');
        const contract = JSON.parse(content) as IntentContract;
        if (currentGoal && contract.goal !== currentGoal) {
            return null;
        }
        return contract;
    } catch {
        return null;
    }
}
