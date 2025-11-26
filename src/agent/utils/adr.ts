import path from 'node:path';
import { promises as fs } from 'node:fs';
import { DesignDecision, Assumption } from '../state.js';
import { Logger } from '../../core/logger.js';

/**
 * Creates or updates an ADR file.
 * 
 * @param sddRoot - Root directory of the SDD (e.g., .sdd)
 * @param decision - The design decision to record
 * @param logger - Logger instance
 * @returns The path to the created/updated ADR file
 */
export async function appendAdr(sddRoot: string, decision: DesignDecision, logger?: Logger): Promise<string> {
    const adrDir = path.join(sddRoot, 'architecture', 'adr');
    await fs.mkdir(adrDir, { recursive: true });

    // Determine ID if not provided
    let id = decision.id;
    if (!id) {
        const files = await fs.readdir(adrDir);
        const adrFiles = files.filter(f => f.startsWith('ADR-') && f.endsWith('.md'));
        let maxId = 0;
        for (const file of adrFiles) {
            const match = file.match(/^ADR-(\d+)-/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxId) maxId = num;
            }
        }
        id = `ADR-${String(maxId + 1).padStart(3, '0')}`;
    }

    // Sanitize title for filename
    const sanitizedTitle = decision.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `${id}-${sanitizedTitle}.md`;
    const filepath = path.join(adrDir, filename);

    const content = `# ${id}: ${decision.title}

**Status:** Accepted
**Date:** ${new Date().toISOString().split('T')[0]}

## Context
${decision.context}

## Decision
${decision.decision}

## Alternatives
${decision.alternatives?.map(a => `- ${a}`).join('\n') || 'None recorded.'}

## Consequences
${decision.consequences?.map(c => `- ${c}`).join('\n') || 'None recorded.'}
`;

    await fs.writeFile(filepath, content, 'utf-8');
    if (logger) logger.info(`Created ADR: ${filepath}`);

    return filepath;
}

/**
 * Syncs assumptions to the assumptions log file.
 * 
 * @param sddRoot - Root directory of the SDD
 * @param newAssumptions - List of assumptions to sync
 * @param logger - Logger instance
 */
export async function syncAssumptions(sddRoot: string, newAssumptions: Assumption[], logger?: Logger): Promise<void> {
    const assumptionsFile = path.join(sddRoot, 'assumptions.md');

    let content = '';
    try {
        content = await fs.readFile(assumptionsFile, 'utf-8');
    } catch (e) {
        // File doesn't exist, start fresh
        content = `# Assumptions Log\n\n| ID | Area | Statement | Status | Source | Notes |\n|---|---|---|---|---|---|\n`;
    }

    // Simple parsing to avoid duplicates based on statement (naive) or ID if present
    // For now, we'll just append new ones. A more robust solution would parse the table.
    // Let's try to parse existing IDs to increment.

    const lines = content.split('\n');
    let maxId = 0;
    for (const line of lines) {
        if (line.startsWith('| A-')) {
            const match = line.match(/\| A-(\d+) \|/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxId) maxId = num;
            }
        }
    }

    let appendedCount = 0;
    for (const assumption of newAssumptions) {
        // Skip if already has an ID that might exist (simplified check)
        if (assumption.id && content.includes(`| ${assumption.id} |`)) {
            continue;
        }

        const id = assumption.id || `A-${String(maxId + 1).padStart(3, '0')}`;
        if (!assumption.id) maxId++;

        const row = `| ${id} | ${assumption.area || 'General'} | ${assumption.statement.replace(/\|/g, '\\|')} | ${assumption.status} | ${assumption.source} | ${assumption.notes?.replace(/\|/g, '\\|') || ''} |`;
        content += `${row}\n`;
        appendedCount++;
    }

    if (appendedCount > 0) {
        await fs.writeFile(assumptionsFile, content, 'utf-8');
        if (logger) logger.info(`Synced ${appendedCount} assumptions to ${assumptionsFile}`);
    }
}
