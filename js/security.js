export function sanitizeText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function parseFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toSafeInt(value, fallback = 0) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function formatDuration(durationMs) {
  const safe = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
}

export function formatHours(durationMs) {
  return (durationMs / 3600000).toFixed(2);
}

export function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

async function deriveAesGcmKey(passphrase, saltBytes, iterations = 250000) {
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

export async function encryptJsonPayload(data, passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 250000;
  const key = await deriveAesGcmKey(passphrase, salt, iterations);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    version: 1,
    encrypted: true,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      saltB64: bytesToBase64(salt)
    },
    cipher: {
      name: 'AES-GCM',
      ivB64: bytesToBase64(iv),
      dataB64: bytesToBase64(new Uint8Array(cipherBuffer))
    }
  };
}

export async function decryptJsonPayload(envelope, passphrase) {
  if (!envelope?.encrypted || envelope.version !== 1) {
    throw new Error('Invalid encrypted backup envelope.');
  }
  const salt = base64ToBytes(envelope.kdf?.saltB64 || '');
  const iv = base64ToBytes(envelope.cipher?.ivB64 || '');
  const data = base64ToBytes(envelope.cipher?.dataB64 || '');
  const key = await deriveAesGcmKey(passphrase, salt, Number(envelope.kdf?.iterations) || 250000);

  let decryptedBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  } catch {
    throw new Error('Wrong passphrase or corrupted encrypted backup.');
  }

  try {
    const json = new TextDecoder().decode(new Uint8Array(decryptedBuffer));
    return JSON.parse(json);
  } catch {
    throw new Error('Encrypted payload could not be parsed.');
  }
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function localDateParts(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const out = { year: 0, month: 0, day: 0 };
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type === 'year') out.year = parseInt(p.value, 10);
    if (p.type === 'month') out.month = parseInt(p.value, 10);
    if (p.type === 'day') out.day = parseInt(p.value, 10);
  }
  return out;
}
