import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateBackupEnvelope } from '../js/migrations.js';
import { validateBackupData } from '../js/validation.js';

function validData() {
  const now = Date.now();
  return {
    projects: [
      {
        id: 'p1',
        name: 'Client A',
        hourlyRate: null,
        archived: false,
        createdAtMs: now,
        updatedAtMs: now
      }
    ],
    entries: [
      {
        id: 'e1',
        projectId: 'p1',
        note: 'Work',
        startUtcMs: now - 3600000,
        endUtcMs: now,
        durationMs: 3600000,
        source: 'timer',
        createdAtMs: now,
        updatedAtMs: now
      }
    ],
    settings: [
      {
        id: 'default',
        timezone: 'UTC',
        weekStartsOn: 1,
        roundingMinutes: 0,
        idleDetectionEnabled: false,
        dailyReminderEnabled: false,
        encryptionEnabled: false
      }
    ],
    timer: null
  };
}

test('migrates v0 envelope to schemaVersion 1', () => {
  const env = migrateBackupEnvelope({
    version: 1,
    encrypted: false,
    exportedAt: '2026-02-16T00:00:00.000Z',
    data: validData(),
    checksum: 'abc'
  });

  assert.equal(env.schemaVersion, 1);
  assert.equal(env.version, 1);
  assert.equal(env.encrypted, false);
});

test('accepts valid backup data', () => {
  assert.doesNotThrow(() => validateBackupData(validData()));
});

test('rejects invalid duration mismatch in backup data', () => {
  const bad = validData();
  bad.entries[0].durationMs = 1;
  assert.throws(() => validateBackupData(bad), /duration is inconsistent/i);
});
