import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { createLogger } from '../../src/core/logger.js';

describe('Logger', () => {
    it('should log structured JSON', () => {
        const logFn = mock.fn();
        // Mock console.log
        const originalConsoleLog = console.log;
        console.log = logFn;

        try {
            const logger = createLogger('test-run-id');
            logger.info('test message', { foo: 'bar' });

            assert.strictEqual(logFn.mock.callCount(), 1);
            const callArgs = logFn.mock.calls[0].arguments;
            const logEntry = JSON.parse(callArgs[0]);

            assert.strictEqual(logEntry.level, 'info');
            assert.strictEqual(logEntry.message, 'test message');
            assert.strictEqual(logEntry.runId, 'test-run-id');
            assert.strictEqual(logEntry.foo, 'bar');
            assert.ok(logEntry.ts); // Timestamp should exist
        } finally {
            console.log = originalConsoleLog;
        }
    });
});
