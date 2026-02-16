import { deleteOne, putOne } from './db.js';
import { getState, setState } from './state.js';
import { sanitizeText, parseFiniteNumber } from './security.js';
import { roundDurationMs } from './time-utils.js';
import { validateEntry, validateProject } from './validation.js';

function assertValidTimes(startUtcMs, endUtcMs) {
  if (!Number.isFinite(startUtcMs) || !Number.isFinite(endUtcMs)) {
    throw new Error('Start and end times are required.');
  }
  if (endUtcMs <= startUtcMs) {
    throw new Error('End time must be later than start time.');
  }
}

function upsertEntryInState(entry) {
  setState((draft) => {
    const idx = draft.entries.findIndex((e) => e.id === entry.id);
    if (idx === -1) {
      draft.entries.unshift(entry);
    } else {
      draft.entries[idx] = entry;
    }
    draft.entries.sort((a, b) => b.startUtcMs - a.startUtcMs);
  });
}

export async function createManualEntry({ projectId, note, startIsoLocal, endIsoLocal }) {
  const startUtcMs = new Date(startIsoLocal).getTime();
  const endUtcMs = new Date(endIsoLocal).getTime();
  assertValidTimes(startUtcMs, endUtcMs);

  const now = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    projectId: projectId || null,
    note: sanitizeText(note, 400),
    startUtcMs,
    endUtcMs,
    durationMs: endUtcMs - startUtcMs,
    source: 'manual',
    createdAtMs: now,
    updatedAtMs: now
  };

  validateEntry(entry);
  await putOne('entries', entry);
  upsertEntryInState(entry);
  return entry;
}

export async function createTimerEntry({ projectId, note, startUtcMs, endUtcMs, roundingMinutes }) {
  assertValidTimes(startUtcMs, endUtcMs);
  let durationMs = endUtcMs - startUtcMs;

  if (roundingMinutes > 0) {
    durationMs = roundDurationMs(durationMs, roundingMinutes);
    endUtcMs = startUtcMs + durationMs;
  }

  const now = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    projectId: projectId || null,
    note: sanitizeText(note, 400),
    startUtcMs,
    endUtcMs,
    durationMs,
    source: 'timer',
    createdAtMs: now,
    updatedAtMs: now
  };

  validateEntry(entry);
  await putOne('entries', entry);
  upsertEntryInState(entry);
  return entry;
}

export async function updateEntry(entryId, patch) {
  const state = getState();
  const existing = state.entries.find((e) => e.id === entryId);
  if (!existing) throw new Error('Entry not found.');

  const startUtcMs = patch.startIsoLocal ? new Date(patch.startIsoLocal).getTime() : existing.startUtcMs;
  const endUtcMs = patch.endIsoLocal ? new Date(patch.endIsoLocal).getTime() : existing.endUtcMs;
  assertValidTimes(startUtcMs, endUtcMs);

  const next = {
    ...existing,
    projectId: patch.projectId !== undefined ? patch.projectId || null : existing.projectId,
    note: patch.note !== undefined ? sanitizeText(patch.note, 400) : existing.note,
    startUtcMs,
    endUtcMs,
    durationMs: endUtcMs - startUtcMs,
    updatedAtMs: Date.now()
  };

  validateEntry(next);
  await putOne('entries', next);
  upsertEntryInState(next);
  return next;
}

export async function deleteEntry(entryId) {
  await deleteOne('entries', entryId);
  setState((draft) => {
    draft.entries = draft.entries.filter((entry) => entry.id !== entryId);
  });
}

export async function upsertProject({ id, name, hourlyRate, archived }) {
  const safeName = sanitizeText(name, 80);
  if (!safeName) throw new Error('Project name is required.');

  const now = Date.now();
  const project = {
    id: id || crypto.randomUUID(),
    name: safeName,
    hourlyRate: hourlyRate === '' || hourlyRate === null ? null : parseFiniteNumber(hourlyRate, 0),
    archived: Boolean(archived),
    createdAtMs: now,
    updatedAtMs: now
  };

  const state = getState();
  const existing = id ? state.projects.find((p) => p.id === id) : null;
  if (existing) {
    project.createdAtMs = existing.createdAtMs;
  }

  validateProject(project);
  await putOne('projects', project);
  setState((draft) => {
    const idx = draft.projects.findIndex((p) => p.id === project.id);
    if (idx === -1) draft.projects.push(project);
    else draft.projects[idx] = project;
    draft.projects.sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  });
}
