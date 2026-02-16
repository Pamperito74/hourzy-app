import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVaultConfig,
  decryptVaultPayload,
  encryptVaultPayload,
  hasUnlockedVaultSession,
  lockVaultSession,
  unlockVaultSession
} from '../js/vault.js';

test('vault create -> encrypt -> lock -> unlock -> decrypt flow', async () => {
  lockVaultSession();
  const cfg = await createVaultConfig('vault-passphrase-123');

  const original = {
    projects: [{ id: 'p1' }],
    entries: [{ id: 'e1', endUtcMs: 2 }],
    timer: { id: 'active', startUtcMs: 1 }
  };

  const envelope = await encryptVaultPayload(original);
  assert.equal(hasUnlockedVaultSession(), true);

  lockVaultSession();
  assert.equal(hasUnlockedVaultSession(), false);

  await unlockVaultSession('vault-passphrase-123', { enabled: true, ...cfg });
  const decrypted = await decryptVaultPayload(envelope);
  assert.deepEqual(decrypted, original);
});

test('vault decrypt fails on wrong passphrase', async () => {
  lockVaultSession();
  const cfg = await createVaultConfig('correct-passphrase-123');
  const envelope = await encryptVaultPayload({ projects: [], entries: [], timer: null });

  lockVaultSession();
  await unlockVaultSession('wrong-passphrase-123', { enabled: true, ...cfg });

  await assert.rejects(() => decryptVaultPayload(envelope), /wrong passphrase|corrupted/i);
});
