import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';

import { runCommand } from '../../tools/test_runner.js';

export function verifierNode(cfg: KotefConfig) {
    return async (_state: AgentState): Promise<Partial<AgentState>> => {
        // Determine test command from architect.md or default
        // For MVP, let's look for "npm test" or similar in architect.md, or default to "npm test"
        const testCmd = "npm test"; // Simplify for now

        const result = await runCommand(cfg, testCmd);

        // If passed, we are done.
        // If failed, we update state so Planner can see it.

        return {
            testResults: result,
            done: result.passed
        };
    };
}
