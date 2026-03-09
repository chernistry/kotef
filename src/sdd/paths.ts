import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface BacklogPaths {
    backlogDir: string;
    openDir: string;
    closedDir: string;
    legacyOpenDir: string;
    legacyClosedDir: string;
}

export interface TicketLocation {
    id: string;
    fileName: string;
    path: string;
}

export function getBacklogPaths(rootDir: string): BacklogPaths {
    const backlogDir = path.join(rootDir, '.sdd', 'backlog');
    return {
        backlogDir,
        openDir: path.join(backlogDir, 'open'),
        closedDir: path.join(backlogDir, 'closed'),
        legacyOpenDir: path.join(backlogDir, 'tickets', 'open'),
        legacyClosedDir: path.join(backlogDir, 'tickets', 'closed'),
    };
}

export async function ensureCanonicalBacklogDirs(rootDir: string): Promise<BacklogPaths> {
    const paths = getBacklogPaths(rootDir);
    await fs.mkdir(paths.openDir, { recursive: true });
    await fs.mkdir(paths.closedDir, { recursive: true });
    return paths;
}

async function readMarkdownFiles(dir: string): Promise<string[]> {
    try {
        const files = await fs.readdir(dir);
        return files.filter(file => file.endsWith('.md'));
    } catch {
        return [];
    }
}

export async function listOpenTickets(rootDir: string): Promise<TicketLocation[]> {
    const backlog = getBacklogPaths(rootDir);
    const candidates = [
        { dir: backlog.openDir, files: await readMarkdownFiles(backlog.openDir) },
        { dir: backlog.legacyOpenDir, files: await readMarkdownFiles(backlog.legacyOpenDir) },
    ];

    return candidates
        .flatMap(({ dir, files }) => files.map(fileName => ({
            fileName,
            id: fileName.replace(/\.md$/, ''),
            path: path.join(dir, fileName),
        })))
        .sort((left, right) => left.fileName.localeCompare(right.fileName, undefined, { numeric: true }));
}

export async function findTicketByPrefix(rootDir: string, prefix: string): Promise<TicketLocation | null> {
    const tickets = await listOpenTickets(rootDir);
    return tickets.find(ticket => ticket.fileName.startsWith(prefix)) ?? null;
}

export function inferTicketStatus(ticketPath: string): 'open' | 'closed' {
    return ticketPath.includes('/closed/') ? 'closed' : 'open';
}

export function getClosedTicketDestination(ticketPath: string): string {
    if (ticketPath.includes('/backlog/open/')) {
        return ticketPath.replace('/backlog/open/', '/backlog/closed/');
    }
    if (ticketPath.includes('/backlog/tickets/open/')) {
        return ticketPath.replace('/backlog/tickets/open/', '/backlog/tickets/closed/');
    }
    const directory = path.dirname(ticketPath);
    return path.join(path.dirname(directory), 'closed', path.basename(ticketPath));
}
