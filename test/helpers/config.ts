import { createKotefConfig, KotefConfig } from '../../src/core/config.js';

export function createTestConfig(overrides: Partial<KotefConfig> = {}): KotefConfig {
    return createKotefConfig({
        rootDir: '/tmp/kotef-test',
        modelFast: 'gpt-5-mini',
        modelStrong: 'gpt-5',
        dryRun: true,
        mockMode: true,
        ...overrides,
    });
}
