import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';

export function ticketCloserNode(_cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('ticket-closer');
        log.info('Ticket closer node started');

        const ticketPath = state.sdd?.ticketPath;

        if (!ticketPath) {
            log.info('No ticketPath in state; nothing to close.');
            return {};
        }

        if (_cfg.dryRun) {
            log.info('Dry-run mode: skipping ticket close operation.', { ticketPath });
            return {};
        }

        try {
            const openPath = ticketPath;
            const openDir = path.dirname(openPath);
            const closedDir = path.join(path.dirname(openDir), 'closed');

            await fs.mkdir(closedDir, { recursive: true });

            const destPath = path.join(closedDir, path.basename(openPath));

            await fs.rename(openPath, destPath);

            log.info('Ticket moved to closed backlog', {
                from: openPath,
                to: destPath
            });

            // Ticket 45: Ensure git commit
            if (_cfg.gitEnabled) {
                try {
                    const cwd = _cfg.rootDir || process.cwd();

                    // 1. Force stage all changes
                    await execa('git', ['add', '.'], { cwd });

                    // 2. Check for changes
                    const { stdout: status } = await execa('git', ['status', '--porcelain'], { cwd });

                    if (status.trim()) {
                        const ticketName = path.basename(openPath, '.md');
                        const ticketIdMatch = ticketName.match(/^(\d+)/);
                        const ticketId = ticketIdMatch ? ticketIdMatch[1] : 'XX';
                        const ticketTitle = ticketName.replace(/^\d+-/, '').replace(/-/g, ' ');

                        const commitMsg = `feat: Complete Ticket ${ticketId} - ${ticketTitle}`;

                        await execa('git', ['commit', '-m', commitMsg], { cwd });
                        log.info('Committed ticket changes', { commitMsg });
                    } else {
                        log.info('No changes to commit after ticket completion.');
                    }
                } catch (gitErr: any) {
                    log.warn('Failed to commit ticket changes', { error: gitErr.message });
                }
            }

            return {
                sdd: {
                    ...state.sdd,
                    ticketPath: destPath
                }
            };
        } catch (error: any) {
            log.warn('Failed to move ticket to closed backlog', {
                ticketPath,
                error: error?.message || String(error)
            });
            // Do not fail the whole run because closing the ticket failed.
            return {};
        }
    };
}

