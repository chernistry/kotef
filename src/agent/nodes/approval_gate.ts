import { interrupt } from '@langchain/langgraph';

import { KotefConfig } from '../../core/config.js';
import { AgentState } from '../state.js';
import { createLogger } from '../../core/logger.js';

export function approvalGateNode(cfg: KotefConfig) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('approval-gate');

        if (cfg.approvalMode !== 'human-gate') {
            return {
                runControl: {
                    ...state.runControl,
                    approvalRequested: false,
                    approvalGranted: true,
                    approvalMode: cfg.approvalMode,
                }
            };
        }

        const decision = interrupt<{
            type: 'approval-request';
            goal?: string;
            ticketId?: string;
            threadId?: string;
        }, { approved?: boolean }>({
            type: 'approval-request',
            goal: state.sdd.goal,
            ticketId: state.sdd.ticketId,
            threadId: state.runControl?.threadId,
        });

        const approved = decision?.approved !== false;
        log.info('Approval gate resumed', { approved, threadId: state.runControl?.threadId });

        return {
            runControl: {
                ...state.runControl,
                approvalRequested: true,
                approvalGranted: approved,
                approvalMode: cfg.approvalMode,
                approvalGrantedAt: Date.now(),
            }
        };
    };
}
