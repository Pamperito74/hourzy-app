import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseAndValidateBackupText } from '../js/import.js';
import { buildBackupEnvelope } from '../js/export.js';
import { encryptJsonPayload } from '../js/security.js';

const FIXTURE_PATH = new URL('./fixtures/backup-v1.json', import.meta.url);

test('parses and validates fixture backup', async () => {
  const text = await fs.readFile(FIXTURE_PATH, 'utf8');
  const parsed = await parseAndValidateBackupText(text);

  assert.equal(parsed.version, 1);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.data.projects.length, 1);
  assert.equal(parsed.data.entries.length, 1);
});

test('roundtrip plain envelope parse', async () => {
  const data = {
    projects: [{ id: 'p1', name: 'P', hourlyRate: null, archived: false, createdAtMs: 1, updatedAtMs: 1 }],
    entries: [{ id: 'e1', projectId: 'p1', note: '', startUtcMs: 10, endUtcMs: 20, durationMs: 10, source: 'timer', createdAtMs: 20, updatedAtMs: 20 }],
    settings: [{ id: 'default', timezone: 'UTC', weekStartsOn: 1, roundingMinutes: 0, idleDetectionEnabled: false, dailyReminderEnabled: false, encryptionEnabled: false, vaultAutoLockMinutes: 15 }],
    timer: null
  };

  const envelope = await buildBackupEnvelope(data, '2026-02-16T00:00:00.000Z');
  const reparsed = await parseAndValidateBackupText(JSON.stringify(envelope));

  assert.deepEqual(reparsed.data, data);
});

test('roundtrip encrypted envelope parse', async () => {
  const data = {
    projects: [{ id: 'p2', name: 'Q', hourlyRate: null, archived: false, createdAtMs: 2, updatedAtMs: 2 }],
    entries: [{ id: 'e2', projectId: 'p2', note: 'x', startUtcMs: 100, endUtcMs: 220, durationMs: 120, source: 'manual', createdAtMs: 220, updatedAtMs: 220 }],
    settings: [{ id: 'default', timezone: 'UTC', weekStartsOn: 1, roundingMinutes: 0, idleDetectionEnabled: false, dailyReminderEnabled: false, encryptionEnabled: false, vaultAutoLockMinutes: 15 }],
    timer: null
  };

  const envelope = await buildBackupEnvelope(data);
  const encrypted = await encryptJsonPayload(envelope, 'strong-passphrase-123');

  const reparsed = await parseAndValidateBackupText(JSON.stringify(encrypted), async () => 'strong-passphrase-123');
  assert.deepEqual(reparsed.data, data);
});
