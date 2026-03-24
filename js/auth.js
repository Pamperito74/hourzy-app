import { getAll, initDb, putOne } from './db.js';
import { sanitizeText } from './security.js';

const SESSION_KEY = 'hourzy:auth-session';
const USERNAME_SUPERADMIN = 'superadmin';
const DEFAULT_SUPERADMIN_PASSWORD = 'SuperAdmin1234!!!!';
const PASSWORD_ITERATIONS = 200000;

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

async function derivePasswordHash(password, saltBytes, iterations = PASSWORD_ITERATIONS) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    256
  );

  return bytesToBase64(new Uint8Array(bits));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);
  return {
    hash,
    saltB64: bytesToBase64(salt),
    iterations: PASSWORD_ITERATIONS
  };
}

async function verifyPassword(password, user) {
  const salt = base64ToBytes(user.passwordSaltB64);
  const hash = await derivePasswordHash(password, salt, Number(user.passwordIterations) || PASSWORD_ITERATIONS);
  return hash === user.passwordHash;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAtMs: user.createdAtMs,
    updatedAtMs: user.updatedAtMs
  };
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getAuthSession() {
  return readSession();
}

export async function ensureAuthBootstrap() {
  await initDb();
  const users = await getAll('users');
  console.debug('[auth] ensureAuthBootstrap: users in DB:', users.length, users.map(u => u.username));
  const hasSuperadmin = users.some((u) => String(u.username).toLowerCase() === USERNAME_SUPERADMIN);
  if (hasSuperadmin) {
    console.debug('[auth] superadmin already exists, skipping seed');
    return;
  }

  const now = Date.now();
  const password = await hashPassword(DEFAULT_SUPERADMIN_PASSWORD);
  const superadmin = {
    id: crypto.randomUUID(),
    username: USERNAME_SUPERADMIN,
    role: 'superadmin',
    isActive: true,
    passwordHash: password.hash,
    passwordSaltB64: password.saltB64,
    passwordIterations: password.iterations,
    createdAtMs: now,
    updatedAtMs: now
  };
  await putOne('users', superadmin);
  console.debug('[auth] superadmin seeded successfully');
}

export async function loginWithPassword(username, password) {
  const safeUsername = sanitizeText(String(username || ''), 64).toLowerCase();
  console.debug('[auth] login attempt for:', safeUsername);
  if (!safeUsername || !password) throw new Error('Username and password are required.');

  const users = await getAll('users');
  console.debug('[auth] users in DB at login time:', users.length, users.map(u => u.username));
  const user = users.find((u) => String(u.username).toLowerCase() === safeUsername);
  console.debug('[auth] user found:', Boolean(user), 'isActive:', user?.isActive);
  if (!user || !user.isActive) throw new Error('Invalid credentials.');

  const ok = await verifyPassword(password, user);
  console.debug('[auth] password verify result:', ok);
  if (!ok) throw new Error('Invalid credentials.');

  const session = {
    userId: user.id,
    username: user.username,
    role: user.role,
    issuedAtMs: Date.now()
  };
  writeSession(session);
  return session;
}

export function requireSuperadmin(session) {
  if (!session || session.role !== 'superadmin') {
    throw new Error('Only superadmin can perform this action.');
  }
}

function requireSession(session) {
  if (!session?.userId) {
    throw new Error('You must be logged in.');
  }
}

export async function listUsers(session) {
  requireSuperadmin(session);
  const users = await getAll('users');
  return users
    .map(publicUser)
    .sort((a, b) => a.username.localeCompare(b.username));
}

export async function createUser(session, { username, password, role }) {
  requireSuperadmin(session);

  const safeUsername = sanitizeText(String(username || ''), 64).toLowerCase();
  if (!safeUsername || safeUsername.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }

  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const safeRole = role === 'admin' ? 'admin' : 'user';
  const users = await getAll('users');
  if (users.some((u) => String(u.username).toLowerCase() === safeUsername)) {
    throw new Error('Username already exists.');
  }

  const now = Date.now();
  const pw = await hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    username: safeUsername,
    role: safeRole,
    isActive: true,
    passwordHash: pw.hash,
    passwordSaltB64: pw.saltB64,
    passwordIterations: pw.iterations,
    createdAtMs: now,
    updatedAtMs: now
  };

  await putOne('users', user);
  return publicUser(user);
}

export async function changeOwnPassword(session, { currentPassword, newPassword }) {
  requireSession(session);

  if (typeof currentPassword !== 'string' || !currentPassword) {
    throw new Error('Current password is required.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }

  const users = await getAll('users');
  const user = users.find((u) => u.id === session.userId);
  if (!user || !user.isActive) throw new Error('User not found.');

  const ok = await verifyPassword(currentPassword, user);
  if (!ok) throw new Error('Current password is incorrect.');

  const next = await hashPassword(newPassword);
  user.passwordHash = next.hash;
  user.passwordSaltB64 = next.saltB64;
  user.passwordIterations = next.iterations;
  user.updatedAtMs = Date.now();
  await putOne('users', user);
}

export async function resetUserPassword(session, { userId, newPassword }) {
  requireSuperadmin(session);
  if (!userId) throw new Error('Target user is required.');
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }

  const users = await getAll('users');
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('User not found.');

  const next = await hashPassword(newPassword);
  user.passwordHash = next.hash;
  user.passwordSaltB64 = next.saltB64;
  user.passwordIterations = next.iterations;
  user.updatedAtMs = Date.now();
  await putOne('users', user);
}

export async function deleteUser(session, { userId }) {
  requireSuperadmin(session);
  if (!userId) throw new Error('Target user is required.');
  if (userId === session.userId) throw new Error('You cannot delete your own account.');

  const users = await getAll('users');
  const user = users.find((u) => u.id === userId);
  if (!user) throw new Error('User not found.');
  if (String(user.username).toLowerCase() === USERNAME_SUPERADMIN) {
    throw new Error('Default superadmin account cannot be deleted.');
  }

  user.isActive = false;
  user.updatedAtMs = Date.now();
  await putOne('users', user);
}
