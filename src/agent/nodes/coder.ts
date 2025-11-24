import { AgentState } from '../state.js';
import { KotefConfig } from '../../core/config.js';

export function coderNode(_cfg: KotefConfig) {
    return async (_state: AgentState): Promise<Partial<AgentState>> => {
        // Stub implementation
        // In real life: call LLM with coder prompt + tools

        return {
            fileChanges: { status: 'simulated_patch_applied' }
        };
    };
}
