import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ensureCanonicalBacklogDirs, getBacklogPaths } from './paths.js';

async function copyMissingFiles(fromDir: string, toDir: string): Promise<number> {
    let copied = 0;
    try {
        const files = await fs.readdir(fromDir);
        await fs.mkdir(toDir, { recursive: true });

        for (const file of files.filter(name => name.endsWith('.md'))) {
            const sourcePath = path.join(fromDir, file);
            const targetPath = path.join(toDir, file);
            try {
                await fs.access(targetPath);
            } catch {
                await fs.copyFile(sourcePath, targetPath);
                copied += 1;
            }
        }
    } catch {
        return copied;
    }
    return copied;
}

export async function migrateLegacySddLayout(rootDir: string): Promise<{ copiedOpen: number; copiedClosed: number }> {
    const backlog = getBacklogPaths(rootDir);
    await ensureCanonicalBacklogDirs(rootDir);

    const copiedOpen = await copyMissingFiles(backlog.legacyOpenDir, backlog.openDir);
    const copiedClosed = await copyMissingFiles(backlog.legacyClosedDir, backlog.closedDir);

    return { copiedOpen, copiedClosed };
}
