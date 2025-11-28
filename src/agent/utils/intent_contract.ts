/**
 * Intent Contract: captures goal, constraints, appetite, non-goals, and DoD in one place.
 * Built once per run and reused across nodes. Enables early exit when DoD is satisfied.
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
 * Parse constraints from text. Looks for lines starting with constraint keywords.
 */
function parseConstraints(text: string): string[] {
    if (!text) return [];
    const lines = text.split('\n');
    const constraintPatterns = [
        /^[-*]?\s*(DO NOT|MUST NOT|Never|Forbidden:)/i,
        /^[-*]?\s*Constraint:/i
    ];
    return lines
        .map(l => l.trim())
        .filter(l => constraintPatterns.some(p => p.test(l)))
        .map(l => l.replace(/^[-*]\s*/, '').trim());
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

/**
 * Parse DoD checks from ticket or goal text
 */
function parseDodChecks(text: string): string[] {
    if (!text) return [];
    // Look for "Definition of Done" or "DoD" section
    const dodMatch = text.match(/(?:Definition of Done|DoD|## DoD)[:\s]*\n([\s\S]*?)(?=\n##|$)/i);
    if (dodMatch) {
        return dodMatch[1]
            .split('\n')
            .map(l => l.replace(/^[-*\[\]x ]+/i, '').trim())
            .filter(l => l && !l.startsWith('#'));
    }
    // Fallback: look for checkbox items
    const checkboxes = text.match(/^[-*]\s*\[[ x]\]\s*.+$/gim);
    return checkboxes?.map(l => l.replace(/^[-*]\s*\[[ x]\]\s*/, '').trim()) || [];
}

/**
 * Infer appetite from goal/ticket text
 */
function inferAppetite(text: string): 'Small' | 'Batch' | 'Big' {
    const lower = text.toLowerCase();
    if (lower.includes('refactor') || lower.includes('redesign') || lower.includes('major')) {
        return 'Big';
    }
    if (lower.includes('fix') || lower.includes('typo') || lower.includes('small') || lower.includes('quick')) {
        return 'Small';
    }
    return 'Batch';
}

export interface BuildIntentParams {
    goal?: string;
    ticketMarkdown?: string;
    shapedGoal?: { appetite: 'Small' | 'Batch' | 'Big'; nonGoals: string[]; clarifiedIntent: string };
    clarifiedGoal?: { functional_outcomes: string[]; non_functional_risks: string[]; DoD_checks: string[]; constraints: string[] };
    kotefText?: string;
}

/**
 * Build an IntentContract from available sources
 */
export function buildIntentContract(params: BuildIntentParams): IntentContract {
    const { goal, ticketMarkdown, shapedGoal, clarifiedGoal, kotefText } = params;

    const allText = [goal, ticketMarkdown, kotefText].filter(Boolean).join('\n');

    // Merge constraints from all sources
    const constraints = [
        ...parseConstraints(allText),
        ...(clarifiedGoal?.constraints || [])
    ];

    // Merge DoD checks
    const dodChecks = [
        ...parseDodChecks(ticketMarkdown || ''),
        ...(clarifiedGoal?.DoD_checks || [])
    ];

    return {
        goal: goal || shapedGoal?.clarifiedIntent || '',
        ticketId: ticketMarkdown?.match(/^# Ticket:\s*(\S+)/m)?.[1],
        appetite: shapedGoal?.appetite || inferAppetite(allText),
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
        // Only reuse if goal matches
        if (currentGoal && contract.goal !== currentGoal) {
            return null;
        }
        return contract;
    } catch {
        return null;
    }
}
