import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { loadConfig } from '../../src/core/config.js';
describe('Config', () => {
    const originalEnv = process.env;
    afterEach(() => {
        process.env = originalEnv;
    });
    it('should load config from env vars', () => {
        process.env = {
            ...originalEnv,
            OPENAI_API_KEY: 'test-key',
            OPENAI_MODEL: 'gpt-4.1-test',
            KOTEF_DRY_RUN: 'false',
            MAX_WEB_REQUESTS_PER_RUN: '50',
        };
        const config = loadConfig();
        assert.strictEqual(config.apiKey, 'test-key');
        assert.strictEqual(config.modelFast, 'gpt-4.1-test');
        assert.strictEqual(config.dryRun, false);
        assert.strictEqual(config.maxWebRequestsPerRun, 50);
    });
    it('should use defaults when env vars are missing', () => {
        process.env = {
            ...originalEnv,
            OPENAI_API_KEY: 'test-key', // Required
        };
        const config = loadConfig();
        assert.strictEqual(config.baseUrl, 'https://api.openai.com/v1');
        assert.strictEqual(config.dryRun, true);
        assert.strictEqual(config.maxRunSeconds, 300);
    });
    it('should throw if required keys are missing', () => {
        process.env = {
            ...originalEnv,
            OPENAI_API_KEY: '', // Missing
            KOTEF_API_KEY: '', // Missing
        };
        assert.throws(() => loadConfig(), /API Key is required/);
    });
});
