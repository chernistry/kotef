import test from 'node:test';
import assert from 'node:assert/strict';
import { average } from '../src/average.js';

test('computes average for numbers', () => {
  assert.equal(average([2, 4, 6]), 4);
  assert.equal(average([1]), 1);
});

test('throws on non-array', () => {
  assert.throws(() => average('nope'), /array/);
});

test('rejects empty input explicitly', () => {
  assert.throws(() => average([]), /empty/i);
});
