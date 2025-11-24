import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';

export function verifierNode(_cfg: KotefConfig) {
    return async (_state: AgentState): Promise<Partial<AgentState>> => {
        // Stub implementation
        // In real life: run tests

        return {
            testResults: { passed: true },
            done: true
        };
    };
}
