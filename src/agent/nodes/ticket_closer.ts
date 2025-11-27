import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import fs from 'node:fs/promises';
import path from 'node:path';

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

