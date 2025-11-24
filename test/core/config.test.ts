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
            OPENAI_MODEL: 'gpt-4-test',
            KOTEF_DRY_RUN: 'false',
        };

        const config = loadConfig();
        assert.strictEqual(config.openaiApiKey, 'test-key');
        assert.strictEqual(config.openaiModel, 'gpt-4-test');
        assert.strictEqual(config.dryRun, false);
    });

    it('should use defaults when env vars are missing', () => {
        process.env = {
            ...originalEnv,
            OPENAI_API_KEY: 'test-key', // Required
        };

        const config = loadConfig();
        assert.strictEqual(config.openaiBaseUrl, 'https://api.openai.com/v1');
        assert.strictEqual(config.dryRun, true);
    });

    it('should throw if required keys are missing', () => {
        process.env = {
            ...originalEnv,
            OPENAI_API_KEY: '', // Missing
        };

        assert.throws(() => loadConfig(), /OPENAI_API_KEY is required/);
    });
});
