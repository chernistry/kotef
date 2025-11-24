import test from 'node:test';
import assert from 'node:assert/strict';
import { Logger } from '../src/logger.js';

test('prefixes info and error logs with level and timestamp', () => {
  const messages = [];
  const fakeConsole = {
    log: (msg) => messages.push(msg),
    error: (msg) => messages.push(msg)
  };
  const logger = new Logger(fakeConsole);

  logger.info('hello');
  logger.error('boom');

  assert.ok(messages[0].startsWith('[INFO]'), 'info should have level prefix');
  assert.ok(messages[1].startsWith('[ERROR]'), 'error should have level prefix');
  assert.ok(messages.every((m) => /\d{4}-\d{2}-\d{2}T/.test(m)), 'messages should include ISO timestamp');
});
