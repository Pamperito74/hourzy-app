import { decryptVaultPayload, createVaultConfig, encryptVaultPayload, hasUnlockedVaultSession, lockVaultSession, unlockVaultSession } from './vault.js';
import { validateBackupData } from './validation.js';

const DB_NAME = 'hourzy-v1';
const DB_VERSION = 3;
const PROTECTED_STORES = new Set(['projects', 'entries', 'timer']);
const VAULT_VERSION_KEY = 'hourzy:vault-version';
const VAULT_CHANNEL_NAME = 'hourzy-vault';

let dbPromise;
let vaultCache = null;
let vaultWriteTimer = null;
let vaultPendingWrite = null;
let vaultVersion = 0;
let vaultChannel = null;

function withRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function bumpVaultVersion(reason = 'update') {
  vaultVersion += 1;
  try {
    localStorage.setItem(VAULT_VERSION_KEY, JSON.stringify({
      version: vaultVersion,
      reason,
      atMs: Date.now()
    }));
  } catch {
    // Ignore storage write failures.
  }
  vaultChannel?.postMessage({ type: 'vault-version', version: vaultVersion, reason });
}

function markVaultCacheStale() {
  vaultCache = null;
  if (vaultWriteTimer) {
    clearTimeout(vaultWriteTimer);
    vaultWriteTimer = null;
  }
  vaultPendingWrite = null;
}

function initVaultCoherenceListeners() {
  if (!vaultChannel && typeof BroadcastChannel !== 'undefined') {
    vaultChannel = new BroadcastChannel(VAULT_CHANNEL_NAME);
  }

  vaultChannel?.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'vault-version' || data.type === 'vault-locked') {
      markVaultCacheStale();
      if (data.type === 'vault-locked') {
        lockVaultSession();
      }
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== VAULT_VERSION_KEY) return;
    markVaultCacheStale();
  });
}

export async function nukeAllLocalData() {
  localStorage.clear();
  if (typeof indexedDB !== 'undefined') {
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
  }
}

export function initDb() {
  if (dbPromise) return dbPromise;
  initVaultCoherenceListeners();

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('startUtcMs', 'startUtcMs', { unique: false });
        entries.createIndex('projectId', 'projectId', { unique: false });
      }

      if (!db.objectStoreNames.contains('timer')) {
        db.createObjectStore('timer', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('vault')) {
        db.createObjectStore('vault', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });

  return dbPromise;
}

async function readVaultConfig(db) {
  const tx = db.transaction('meta', 'readonly');
  const cfg = await withRequest(tx.objectStore('meta').get('vault-config'));
  await txDone(tx);
  return cfg || { id: 'vault-config', enabled: false, iterations: 250000, saltB64: '', updatedAtMs: Date.now() };
}

async function writeVaultConfig(db, patch) {
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({
    id: 'vault-config',
    enabled: Boolean(patch.enabled),
    iterations: Number(patch.iterations) || 250000,
    saltB64: patch.saltB64 || '',
    updatedAtMs: Date.now()
  });
  await txDone(tx);
}

async function isVaultEnabled() {
  const db = await initDb();
  const cfg = await readVaultConfig(db);
  return Boolean(cfg?.enabled);
}

async function loadVaultState(db) {
  const cfg = await readVaultConfig(db);
  if (!cfg.enabled) return null;
  if (!hasUnlockedVaultSession()) {
    throw new Error('Encrypted local storage is locked. Unlock it in Settings.');
  }

  if (vaultCache) return vaultCache;

  const tx = db.transaction('vault', 'readonly');
  const record = await withRequest(tx.objectStore('vault').get('state'));
  await txDone(tx);

  vaultCache = await decryptVaultPayload(record);
  return vaultCache;
}

async function persistVaultState(db, state) {
  vaultPendingWrite = clone(state);
  vaultCache = clone(state);

  if (!vaultWriteTimer) {
    vaultWriteTimer = setTimeout(async () => {
      const pending = vaultPendingWrite;
      vaultPendingWrite = null;
      vaultWriteTimer = null;
      if (!pending) return;
      const envelope = await encryptVaultPayload(pending);
      const tx = db.transaction('vault', 'readwrite');
      tx.objectStore('vault').put(envelope);
      await txDone(tx);
      bumpVaultVersion('vault-write');
    }, 250);
  }
}

async function flushVaultWrites(db) {
  if (!vaultWriteTimer && !vaultPendingWrite) return;
  if (vaultWriteTimer) {
    clearTimeout(vaultWriteTimer);
    vaultWriteTimer = null;
  }
  const pending = vaultPendingWrite;
  vaultPendingWrite = null;
  if (!pending) return;
  const envelope = await encryptVaultPayload(pending);
  const tx = db.transaction('vault', 'readwrite');
  tx.objectStore('vault').put(envelope);
  await txDone(tx);
  bumpVaultVersion('vault-flush');
}

function mutateVaultCollection(state, storeName, value) {
  if (storeName === 'projects') {
    const idx = state.projects.findIndex((row) => row.id === value.id);
    if (idx === -1) state.projects.push(value);
    else state.projects[idx] = value;
    return;
  }

  if (storeName === 'entries') {
    const idx = state.entries.findIndex((row) => row.id === value.id);
    if (idx === -1) state.entries.push(value);
    else state.entries[idx] = value;
    return;
  }

  if (storeName === 'timer') {
    state.timer = value;
  }
}

function deleteVaultCollection(state, storeName, key) {
  if (storeName === 'projects') {
    state.projects = state.projects.filter((row) => row.id !== key);
    return;
  }
  if (storeName === 'entries') {
    state.entries = state.entries.filter((row) => row.id !== key);
    return;
  }
  if (storeName === 'timer') {
    state.timer = null;
  }
}

export async function ensureDefaults(defaultSettings) {
  const db = await initDb();
  const tx = db.transaction(['settings', 'meta'], 'readwrite');
  const settingsStore = tx.objectStore('settings');
  const metaStore = tx.objectStore('meta');

  const existingSettings = await withRequest(settingsStore.get('default'));
  if (!existingSettings) {
    settingsStore.put(defaultSettings);
  } else {
    const needsPatch =
      typeof existingSettings.encryptionEnabled !== 'boolean'
      || !Number.isFinite(Number(existingSettings.vaultAutoLockMinutes));
    if (needsPatch) {
      settingsStore.put({
        ...existingSettings,
        encryptionEnabled: typeof existingSettings.encryptionEnabled === 'boolean' ? existingSettings.encryptionEnabled : false,
        vaultAutoLockMinutes: Number.isFinite(Number(existingSettings.vaultAutoLockMinutes))
          ? Number(existingSettings.vaultAutoLockMinutes)
          : 15
      });
    }
  }

  const existingMeta = await withRequest(metaStore.get('schema'));
  if (!existingMeta) {
    metaStore.put({ id: 'schema', version: DB_VERSION, updatedAtMs: Date.now() });
  }

  const vaultCfg = await withRequest(metaStore.get('vault-config'));
  if (!vaultCfg) {
    metaStore.put({ id: 'vault-config', enabled: false, iterations: 250000, saltB64: '', updatedAtMs: Date.now() });
  }

  await txDone(tx);
}

export async function getVaultStatus() {
  const db = await initDb();
  const cfg = await readVaultConfig(db);
  return {
    enabled: Boolean(cfg.enabled),
    unlocked: hasUnlockedVaultSession()
  };
}

export async function unlockAtRestEncryption(passphrase) {
  const db = await initDb();
  const cfg = await readVaultConfig(db);
  if (!cfg.enabled) throw new Error('Encrypted local storage is not enabled.');

  await unlockVaultSession(passphrase, cfg);

  // Validate passphrase by attempting decryption.
  const tx = db.transaction('vault', 'readonly');
  const record = await withRequest(tx.objectStore('vault').get('state'));
  await txDone(tx);

  try {
    vaultCache = await decryptVaultPayload(record);
    bumpVaultVersion('vault-unlocked');
  } catch (error) {
    lockVaultSession();
    vaultCache = null;
    throw error;
  }
}

export function lockAtRestEncryption() {
  markVaultCacheStale();
  lockVaultSession();
  vaultChannel?.postMessage({ type: 'vault-locked' });
  bumpVaultVersion('vault-locked');
}

export async function enableAtRestEncryption(passphrase) {
  const db = await initDb();
  await flushVaultWrites(db);
  const cfg = await readVaultConfig(db);
  if (cfg.enabled) {
    throw new Error('Encrypted local storage is already enabled.');
  }

  const nextCfg = await createVaultConfig(passphrase);

  const tx = db.transaction(['projects', 'entries', 'timer', 'settings'], 'readwrite');
  const projects = await withRequest(tx.objectStore('projects').getAll());
  const entries = await withRequest(tx.objectStore('entries').getAll());
  const timer = await withRequest(tx.objectStore('timer').get('active'));
  const settings = await withRequest(tx.objectStore('settings').get('default'));

  tx.objectStore('projects').clear();
  tx.objectStore('entries').clear();
  tx.objectStore('timer').clear();
  tx.objectStore('settings').put({
    ...(settings || {}),
    id: 'default',
    encryptionEnabled: true
  });

  await txDone(tx);

  const nextState = {
    projects: Array.isArray(projects) ? projects : [],
    entries: Array.isArray(entries) ? entries : [],
    timer: timer || null
  };

  await persistVaultState(db, nextState);
  await flushVaultWrites(db);
  await writeVaultConfig(db, { enabled: true, ...nextCfg });
  bumpVaultVersion('vault-enabled');
}

export async function disableAtRestEncryption(passphrase) {
  const db = await initDb();
  await flushVaultWrites(db);
  const cfg = await readVaultConfig(db);
  if (!cfg.enabled) return;

  if (!hasUnlockedVaultSession()) {
    await unlockVaultSession(passphrase, cfg);
  }

  const txReadVault = db.transaction('vault', 'readonly');
  const record = await withRequest(txReadVault.objectStore('vault').get('state'));
  await txDone(txReadVault);
  const state = await decryptVaultPayload(record);

  const tx = db.transaction(['projects', 'entries', 'timer', 'settings', 'vault'], 'readwrite');
  const settings = await withRequest(tx.objectStore('settings').get('default'));

  tx.objectStore('projects').clear();
  tx.objectStore('entries').clear();
  tx.objectStore('timer').clear();

  for (const row of state.projects) tx.objectStore('projects').put(row);
  for (const row of state.entries) tx.objectStore('entries').put(row);
  if (state.timer) tx.objectStore('timer').put(state.timer);

  tx.objectStore('vault').delete('state');
  tx.objectStore('settings').put({
    ...(settings || {}),
    id: 'default',
    encryptionEnabled: false
  });

  await txDone(tx);

  await writeVaultConfig(db, { enabled: false, iterations: cfg.iterations, saltB64: cfg.saltB64 });
  lockAtRestEncryption();
  bumpVaultVersion('vault-disabled');
}

export async function getAll(storeName) {
  const db = await initDb();

  if (PROTECTED_STORES.has(storeName) && await isVaultEnabled()) {
    const state = await loadVaultState(db);
    if (storeName === 'timer') return state.timer ? [clone(state.timer)] : [];
    return clone(state[storeName] || []);
  }

  const tx = db.transaction(storeName, 'readonly');
  const result = await withRequest(tx.objectStore(storeName).getAll());
  await txDone(tx);
  return result;
}

export async function getOne(storeName, key) {
  const db = await initDb();

  if (PROTECTED_STORES.has(storeName) && await isVaultEnabled()) {
    const state = await loadVaultState(db);
    if (storeName === 'timer') {
      if (key !== 'active') return undefined;
      return clone(state.timer || undefined);
    }
    const row = (state[storeName] || []).find((item) => item.id === key);
    return clone(row);
  }

  const tx = db.transaction(storeName, 'readonly');
  const result = await withRequest(tx.objectStore(storeName).get(key));
  await txDone(tx);
  return result;
}

export async function putOne(storeName, value) {
  const db = await initDb();

  if (PROTECTED_STORES.has(storeName) && await isVaultEnabled()) {
    const state = await loadVaultState(db);
    mutateVaultCollection(state, storeName, clone(value));
    await persistVaultState(db, state);
    return;
  }

  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await txDone(tx);
}

export async function deleteOne(storeName, key) {
  const db = await initDb();

  if (PROTECTED_STORES.has(storeName) && await isVaultEnabled()) {
    const state = await loadVaultState(db);
    deleteVaultCollection(state, storeName, key);
    await persistVaultState(db, state);
    return;
  }

  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await txDone(tx);
}

export async function readEntriesByStartDesc(limit = 5000) {
  const db = await initDb();

  if (await isVaultEnabled()) {
    const state = await loadVaultState(db);
    return clone((state.entries || [])
      .slice()
      .sort((a, b) => Number(b.startUtcMs) - Number(a.startUtcMs))
      .slice(0, limit));
  }

  const tx = db.transaction('entries', 'readonly');
  const store = tx.objectStore('entries');
  const index = store.index('startUtcMs');

  const rows = [];
  await new Promise((resolve, reject) => {
    const req = index.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || rows.length >= limit) {
        resolve();
        return;
      }
      rows.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error || new Error('Cursor failed'));
  });

  await txDone(tx);
  return rows;
}

export async function pruneEntriesBefore(cutoffUtcMs) {
  const cutoff = Number(cutoffUtcMs);
  if (!Number.isFinite(cutoff)) throw new Error('Cutoff timestamp is invalid.');
  const db = await initDb();

  if (await isVaultEnabled()) {
    const state = await loadVaultState(db);
    state.entries = (state.entries || []).filter((row) => Number(row.endUtcMs) >= cutoff);
    await persistVaultState(db, state);
    return;
  }

  const tx = db.transaction('entries', 'readwrite');
  const store = tx.objectStore('entries');
  const all = await withRequest(store.getAll());
  for (const row of all) {
    if (Number(row.endUtcMs) < cutoff) {
      store.delete(row.id);
    }
  }
  await txDone(tx);
}

export async function resetCorruptedVaultData() {
  const db = await initDb();
  const tx = db.transaction(['vault', 'meta', 'settings', 'projects', 'entries', 'timer'], 'readwrite');
  tx.objectStore('vault').delete('state');
  tx.objectStore('projects').clear();
  tx.objectStore('entries').clear();
  tx.objectStore('timer').clear();
  const settings = await withRequest(tx.objectStore('settings').get('default'));
  tx.objectStore('settings').put({
    ...(settings || { id: 'default' }),
    id: 'default',
    encryptionEnabled: false
  });
  tx.objectStore('meta').put({
    id: 'vault-config',
    enabled: false,
    iterations: 250000,
    saltB64: '',
    updatedAtMs: Date.now()
  });
  await txDone(tx);
  lockAtRestEncryption();
  bumpVaultVersion('vault-reset');
}

export async function replaceAllData(payload) {
  validateBackupData(payload);

  const db = await initDb();
  await flushVaultWrites(db);
  const vaultEnabled = await isVaultEnabled();

  const tx = db.transaction(['projects', 'entries', 'timer', 'settings', 'meta', 'vault'], 'readwrite');
  const settingsStore = tx.objectStore('settings');
  const metaStore = tx.objectStore('meta');

  settingsStore.clear();
  for (const item of payload.settings) settingsStore.put(item);

  if (vaultEnabled) {
    const nextState = {
      projects: payload.projects,
      entries: payload.entries,
      timer: payload.timer || null
    };
    const encrypted = await encryptVaultPayload(nextState);
    tx.objectStore('vault').put(encrypted);
    tx.objectStore('projects').clear();
    tx.objectStore('entries').clear();
    tx.objectStore('timer').clear();
    vaultCache = clone(nextState);
  } else {
    tx.objectStore('vault').clear();
    tx.objectStore('projects').clear();
    tx.objectStore('entries').clear();
    tx.objectStore('timer').clear();
    for (const item of payload.projects) tx.objectStore('projects').put(item);
    for (const item of payload.entries) tx.objectStore('entries').put(item);
    if (payload.timer) tx.objectStore('timer').put(payload.timer);
    vaultCache = null;
  }

  metaStore.put({
    id: 'schema',
    version: DB_VERSION,
    importedAtMs: Date.now()
  });

  await txDone(tx);
  bumpVaultVersion('replace-all-data');
}
