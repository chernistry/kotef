import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMessage } from '../src/cli.js';

test('formats message with prefix', () => {
  assert.equal(formatMessage('hi', { prefix: '[x] ' }), '[x] hi');
});

test('supports uppercasing when requested', () => {
  assert.equal(formatMessage('mix', { uppercase: true }), 'MIX');
});

test('rejects empty input', () => {
  assert.throws(() => formatMessage(''), /required/);
});
