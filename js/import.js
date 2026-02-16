import { replaceAllData } from './db.js';
import { migrateBackupEnvelope } from './migrations.js';
import { decryptJsonPayload, sha256Hex } from './security.js';
import { validateBackupData } from './validation.js';

export async function parseAndValidateBackupText(text, resolvePassphrase) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Backup is not valid JSON.');
  }

  if (parsed?.encrypted === true) {
    if (typeof resolvePassphrase !== 'function') {
      throw new Error('Encrypted backup requires passphrase input.');
    }
    const passphrase = await resolvePassphrase();
    if (!passphrase) throw new Error('Import cancelled: passphrase was not provided.');
    parsed = await decryptJsonPayload(parsed, passphrase);
  }

  parsed = migrateBackupEnvelope(parsed);

  if (typeof parsed !== 'object' || parsed === null || parsed.version !== 1 || typeof parsed.checksum !== 'string' || parsed.encrypted !== false) {
    throw new Error('Backup format is invalid or unsupported.');
  }

  const computed = await sha256Hex(JSON.stringify(parsed.data));
  if (computed !== parsed.checksum) {
    throw new Error('Backup checksum mismatch. File may be corrupted or tampered.');
  }

  validateBackupData(parsed.data);
  return parsed;
}

export async function importBackupFile(file, resolvePassphrase) {
  const text = await file.text();
  const parsed = await parseAndValidateBackupText(text, resolvePassphrase);
  await replaceAllData(parsed.data);
}
