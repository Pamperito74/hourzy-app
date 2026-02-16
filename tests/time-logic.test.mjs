import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, splitDurationsByBucket } from '../js/totals.js';

const settingsNy = {
  timezone: 'America/New_York',
  weekStartsOn: 1
};

test('splits entry across local midnight into day buckets', () => {
  const startUtcMs = new Date('2026-01-15T23:30:00-05:00').getTime();
  const endUtcMs = new Date('2026-01-16T01:30:00-05:00').getTime();

  const { day } = splitDurationsByBucket([
    {
      id: 'e1',
      startUtcMs,
      endUtcMs,
      durationMs: endUtcMs - startUtcMs,
      source: 'timer',
      projectId: null,
      note: '',
      createdAtMs: startUtcMs,
      updatedAtMs: endUtcMs
    }
  ], settingsNy);

  assert.equal(day.get('2026-01-15'), 30 * 60 * 1000);
  assert.equal(day.get('2026-01-16'), 90 * 60 * 1000);
});

test('handles DST spring-forward duration correctly (America/New_York)', () => {
  // 01:30 -> 03:30 on spring-forward day is one real hour.
  const startUtcMs = new Date('2026-03-08T01:30:00-05:00').getTime();
  const endUtcMs = new Date('2026-03-08T03:30:00-04:00').getTime();

  const { day } = splitDurationsByBucket([
    {
      id: 'e2',
      startUtcMs,
      endUtcMs,
      durationMs: endUtcMs - startUtcMs,
      source: 'timer',
      projectId: null,
      note: '',
      createdAtMs: startUtcMs,
      updatedAtMs: endUtcMs
    }
  ], settingsNy);

  assert.equal(endUtcMs - startUtcMs, 60 * 60 * 1000);
  assert.equal(day.get('2026-03-08'), 60 * 60 * 1000);
});

test('dateKey stays stable for timezone rendering', () => {
  const utcNoon = Date.UTC(2026, 6, 4, 12, 0, 0);
  assert.equal(dateKey(utcNoon, 'UTC'), '2026-07-04');
  assert.equal(dateKey(utcNoon, 'America/Los_Angeles'), '2026-07-04');
});
