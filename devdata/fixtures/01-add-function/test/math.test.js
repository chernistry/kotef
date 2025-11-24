import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/math.js';

test('adds positive numbers', () => {
  assert.equal(add(1, 2), 3);
  assert.equal(add(10, 5), 15);
});

test('adds negative numbers', () => {
  assert.equal(add(-1, -2), -3);
  assert.equal(add(-1, 2), 1);
});

test('supports floats', () => {
  assert.equal(add(0.1, 0.2), 0.30000000000000004);
});
