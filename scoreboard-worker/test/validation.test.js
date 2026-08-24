import assert from 'node:assert/strict';
import test from 'node:test';

import { validateScore } from '../src/index.js';

test('normalizes a valid arcade score', () => {
  assert.deepEqual(validateScore({ name: ' jak ', timeMs: 35_421 }), {
    ok: true,
    name: 'JAK',
    timeMs: 35_421,
  });
});

test('accepts exactly three letters or numbers', () => {
  assert.equal(validateScore({ name: 'J_T', timeMs: 35_421 }).ok, false);
  assert.equal(validateScore({ name: 'JAKE', timeMs: 35_421 }).ok, false);
  assert.equal(validateScore({ name: 'J4K', timeMs: 35_421 }).ok, true);
});

test('rejects implausible and non-integer times', () => {
  assert.equal(validateScore({ name: 'JAK', timeMs: 9_999 }).ok, false);
  assert.equal(validateScore({ name: 'JAK', timeMs: 24_999 }).ok, false);
  assert.equal(validateScore({ name: 'JAK', timeMs: 25_000 }).ok, true);
  assert.equal(validateScore({ name: 'JAK', timeMs: 600_001 }).ok, false);
  assert.equal(validateScore({ name: 'JAK', timeMs: 35_421.2 }).ok, false);
});
