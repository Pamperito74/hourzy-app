function bytesToBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let sessionKey = null;
let sessionConfig = null;

async function deriveKey(passphrase, saltBytes, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createVaultConfig(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 250000;
  const key = await deriveKey(passphrase, salt, iterations);
  sessionKey = key;
  sessionConfig = {
    enabled: true,
    iterations,
    saltB64: bytesToBase64(salt)
  };
  return { ...sessionConfig };
}

export async function unlockVaultSession(passphrase, config) {
  if (!config?.enabled) throw new Error('Encrypted local storage is not enabled.');
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }

  const iterations = Number(config.iterations) || 250000;
  const salt = base64ToBytes(config.saltB64 || '');
  const key = await deriveKey(passphrase, salt, iterations);
  sessionKey = key;
  sessionConfig = {
    enabled: true,
    iterations,
    saltB64: config.saltB64
  };
}

export function lockVaultSession() {
  sessionKey = null;
  sessionConfig = null;
}

export function hasUnlockedVaultSession() {
  return Boolean(sessionKey);
}

export function getVaultSessionConfig() {
  return sessionConfig;
}

export async function encryptVaultPayload(data) {
  if (!sessionKey) throw new Error('Encrypted local storage is locked.');

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, plaintext);

  return {
    id: 'state',
    ivB64: bytesToBase64(iv),
    dataB64: bytesToBase64(new Uint8Array(cipherBuffer)),
    updatedAtMs: Date.now()
  };
}

export async function decryptVaultPayload(record) {
  if (!sessionKey) throw new Error('Encrypted local storage is locked.');
  if (!record || record.id !== 'state') {
    return {
      projects: [],
      entries: [],
      timer: null
    };
  }

  const iv = base64ToBytes(record.ivB64 || '');
  const data = base64ToBytes(record.dataB64 || '');

  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, data);
  } catch {
    throw new Error('Wrong passphrase or corrupted encrypted local data.');
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(decrypted)));
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      timer: parsed.timer ?? null
    };
  } catch {
    throw new Error('Encrypted local data is invalid.');
  }
}
