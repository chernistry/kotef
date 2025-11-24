import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLogger, Logger } from '../../src/core/logger.js';

describe('Logger', () => {
    it('should log structured JSON', () => {
        const logFn = vi.fn();
        // Mock console.log
        const originalConsoleLog = console.log;
        console.log = logFn;

        const logger = createLogger('test-logger');
        logger.info('test message', { foo: 'bar' });

        // Restore console.log
        console.log = originalConsoleLog;

        expect(logFn).toHaveBeenCalled();
        const callArgs = logFn.mock.calls[0];
        const logEntry = JSON.parse(callArgs[0]);

        expect(logEntry.level).toBe('info');
        expect(logEntry.message).toBe('test message');
        expect(logEntry.runId).toBe('test-logger');
        expect(logEntry.foo).toBe('bar');
        expect(logEntry.ts).toBeDefined();
    });
});
