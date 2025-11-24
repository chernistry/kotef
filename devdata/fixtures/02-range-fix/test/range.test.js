import test from 'node:test';
import assert from 'node:assert/strict';
import { range } from '../src/range.js';

test('builds ascending range exclusive of end', () => {
  assert.deepEqual(range(0, 3), [0, 1, 2]);
  assert.deepEqual(range(2, 5), [2, 3, 4]);
});

test('handles empty range', () => {
  assert.deepEqual(range(3, 3), []);
});

test('throws on invalid inputs', () => {
  assert.throws(() => range('a', 3), /numbers/);
});
