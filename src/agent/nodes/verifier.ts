import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';
import { createLogger } from '../../core/logger.js';

import { runCommand } from '../../tools/test_runner.js';

export function verifierNode(cfg: KotefConfig) {
    return async (_state: AgentState): Promise<Partial<AgentState>> => {
        const log = createLogger('verifier');
        log.info('Verifier node started');
        
        // Determine test command from architect.md or default
        // For MVP, let's look for "npm test" or similar in architect.md, or default to "npm test"
        const testCmd = "npm test"; // Simplify for now

        log.info('Running tests', { command: testCmd });
        const result = await runCommand(cfg, testCmd);
        log.info('Tests completed', { passed: result.passed });

        return {
            testResults: result,
            done: result.passed
        };
    };
}
