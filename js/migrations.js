export const SCHEMA_VERSION = 1;

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function migrateV0ToV1(raw) {
  // v0 backups had no explicit schemaVersion and may omit encrypted flag.
  return {
    version: 1,
    schemaVersion: 1,
    encrypted: false,
    exportedAt: raw.exportedAt || new Date().toISOString(),
    data: {
      projects: normalizeArray(raw?.data?.projects),
      entries: normalizeArray(raw?.data?.entries),
      settings: normalizeArray(raw?.data?.settings),
      timer: raw?.data?.timer || null
    },
    checksum: raw.checksum || ''
  };
}

export function migrateBackupEnvelope(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Backup payload is not an object.');
  }

  if (raw.encrypted === true) return raw;

  const schemaVersion = Number(raw.schemaVersion || 0);
  if (schemaVersion === 1) return raw;
  if (schemaVersion === 0 || raw.version === 1) return migrateV0ToV1(raw);

  throw new Error(`Unsupported backup schema version: ${schemaVersion}`);
}
