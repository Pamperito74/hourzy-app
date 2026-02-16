import { getAll, getOne } from './db.js';
import { SCHEMA_VERSION } from './migrations.js';
import { downloadBlob, encryptJsonPayload, escapeCsvCell, formatHours, sha256Hex } from './security.js';
import { dateKey } from './totals.js';

function toIsoForInput(ms) {
  return new Date(ms).toISOString();
}

export function filterEntries(entries, { from, to, projectId, timeZone }) {
  return entries.filter((entry) => {
    const dKey = dateKey(entry.startUtcMs, timeZone);
    if (from && dKey < from) return false;
    if (to && dKey > to) return false;
    if (projectId && projectId !== 'all' && entry.projectId !== projectId) return false;
    return true;
  });
}

export function exportEntriesCsv({ entries, projects, settings, filters }) {
  const map = new Map(projects.map((p) => [p.id, p.name]));
  const rows = filterEntries(entries, {
    from: filters.from,
    to: filters.to,
    projectId: filters.projectId,
    timeZone: settings.timezone
  });

  const header = ['id', 'project', 'note', 'start_utc', 'end_utc', 'duration_hours', 'source'];
  const body = rows.map((row) => [
    row.id,
    map.get(row.projectId) || 'Unassigned',
    row.note,
    toIsoForInput(row.startUtcMs),
    toIsoForInput(row.endUtcMs),
    formatHours(row.durationMs),
    row.source
  ]);

  const csv = [header, ...body]
    .map((line) => line.map((cell) => escapeCsvCell(cell)).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`hourzy-entries-${stamp}.csv`, blob);
}

export async function buildBackupEnvelope(data, exportedAt = new Date().toISOString()) {
  return {
    version: 1,
    schemaVersion: SCHEMA_VERSION,
    encrypted: false,
    exportedAt,
    data,
    checksum: await sha256Hex(JSON.stringify(data))
  };
}

export async function exportJsonBackup() {
  const [projects, entries, settings, timer] = await Promise.all([
    getAll('projects'),
    getAll('entries'),
    getAll('settings'),
    getOne('timer', 'active')
  ]);

  const wrapped = await buildBackupEnvelope({
    projects,
    entries,
    settings,
    timer: timer || null
  });

  const blob = new Blob([JSON.stringify(wrapped, null, 2)], {
    type: 'application/json;charset=utf-8'
  });

  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`hourzy-backup-${stamp}.json`, blob);
}

export async function exportEncryptedBackup(passphrase) {
  const [projects, entries, settings, timer] = await Promise.all([
    getAll('projects'),
    getAll('entries'),
    getAll('settings'),
    getOne('timer', 'active')
  ]);

  const data = {
    projects,
    entries,
    settings,
    timer: timer || null
  };

  const wrapped = await buildBackupEnvelope(data);

  const encryptedEnvelope = await encryptJsonPayload(wrapped, passphrase);
  const blob = new Blob([JSON.stringify(encryptedEnvelope, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`hourzy-backup-${stamp}.enc.json`, blob);
}
