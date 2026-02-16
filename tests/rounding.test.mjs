import test from 'node:test';
import assert from 'node:assert/strict';
import { roundDurationMs } from '../js/time-utils.js';

test('roundDurationMs returns same value when rounding disabled', () => {
  assert.equal(roundDurationMs(610000, 0), 610000);
});

test('roundDurationMs rounds to nearest configured unit', () => {
  assert.equal(roundDurationMs(8 * 60 * 1000, 15), 15 * 60 * 1000);
  assert.equal(roundDurationMs(22 * 60 * 1000, 15), 15 * 60 * 1000);
  assert.equal(roundDurationMs(38 * 60 * 1000, 15), 45 * 60 * 1000);
});

test('roundDurationMs never returns below one unit when rounding enabled', () => {
  assert.equal(roundDurationMs(1, 5), 5 * 60 * 1000);
});
