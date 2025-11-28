import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';
import { runKiroExecutor, buildExecutorRequest } from '../executors/kiro_executor.js';

/**
 * Kiro Coder Node - thin adapter that delegates to KiroExecutor (Ticket 05)
 * Kotef's brain (SDD, planning, verification) remains in control.
 */
export async function kiroCoderNode(
    state: AgentState,
    config: KotefConfig
): Promise<Partial<AgentState>> {
    const log = createLogger('kiro-coder');
    log.info('Kiro coder node started');

    // Build executor request from state
    const request = buildExecutorRequest(state, config.rootDir);

    log.info('Running Kiro executor', {
        rootDir: config.rootDir,
        hasIntent: !!request.intent,
        targetFiles: request.targetFiles?.length || 0
    });

    // Run executor
    const result = await runKiroExecutor(config, request);

    // Log results
    log.info('Kiro executor completed', {
        success: result.success,
        changedFiles: result.changedFiles.length,
        error: result.error
    });

    if (!result.success) {
        log.warn('Kiro executor failed', { error: result.error });
        return {
            terminalStatus: 'aborted_constraint',
            plan: {
                ...state.plan,
                reason: result.error || 'Kiro executor failed'
            }
        };
    }

    // Update file changes in state
    const updatedFileChanges = { ...state.fileChanges };
    for (const file of result.changedFiles) {
        updatedFileChanges[file] = 1;
    }

    // Track consecutiveNoOps like internal coder
    const initialFileCount = Object.keys(state.fileChanges || {}).length;
    const finalFileCount = Object.keys(updatedFileChanges).length;
    const hasNewChanges = finalFileCount > initialFileCount;
    const consecutiveNoOps = hasNewChanges ? 0 : (state.consecutiveNoOps || 0) + 1;

    log.info('Kiro coder completed', { filesChanged: result.changedFiles.length });

    return {
        fileChanges: updatedFileChanges,
        messages: [
            ...state.messages,
            {
                role: 'assistant',
                content: `Kiro executor modified ${result.changedFiles.length} file(s): ${result.changedFiles.join(', ')}`
            }
        ],
        consecutiveNoOps
    };
}
