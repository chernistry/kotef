import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, setPrettyConsole } from '../../src/core/logger.js';

describe('Logger', () => {
    let originalConsoleLog: typeof console.log;

    beforeEach(() => {
        originalConsoleLog = console.log;
        // Disable pretty console to get pure JSON output
        setPrettyConsole(false);
    });

    afterEach(() => {
        console.log = originalConsoleLog;
        setPrettyConsole(true);
    });

    it('should log structured JSON', () => {
        const logFn = vi.fn();
        console.log = logFn;

        const logger = createLogger('test-logger');
        logger.info('test message', { foo: 'bar' });

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
