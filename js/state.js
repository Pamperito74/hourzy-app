import { ensureDefaults, getAll, getOne, readEntriesByStartDesc } from './db.js';
import { validateEntry, validateProject, validateSettings, validateTimerSnapshot } from './validation.js';

export const defaultSettings = {
  id: 'default',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  weekStartsOn: 1,
  roundingMinutes: 0,
  idleDetectionEnabled: false,
  dailyReminderEnabled: false,
  encryptionEnabled: false,
  vaultAutoLockMinutes: 15
};

const state = {
  ui: {
    activeView: 'tracker',
    filters: {
      from: '',
      to: '',
      projectId: 'all'
    },
    editingEntryId: null,
    lockBanner: ''
  },
  projects: [],
  entries: [],
  settings: { ...defaultSettings },
  timer: {
    isRunning: false,
    projectId: null,
    note: '',
    startUtcMs: 0,
    elapsedMs: 0,
    lastHeartbeatMs: 0
  }
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(mutator) {
  mutator(state);
  for (const listener of listeners) {
    listener(state);
  }
}

function coerceAndValidateRows({ projects, entries, settingsRow, timerRow }) {
  const validProjects = [];
  for (const project of projects) {
    try {
      validateProject(project);
      validProjects.push(project);
    } catch {
      // Skip invalid local rows instead of crashing startup.
    }
  }

  const validEntries = [];
  for (const entry of entries) {
    try {
      validateEntry(entry);
      validEntries.push(entry);
    } catch {
      // Skip invalid local rows instead of crashing startup.
    }
  }

  let safeSettings = { ...defaultSettings };
  if (settingsRow) {
    try {
      validateSettings(settingsRow);
      safeSettings = settingsRow;
    } catch {
      safeSettings = { ...defaultSettings };
    }
  }

  let safeTimer = null;
  if (timerRow) {
    try {
      validateTimerSnapshot(timerRow);
      safeTimer = timerRow;
    } catch {
      safeTimer = null;
    }
  }

  return { validProjects, validEntries, safeSettings, safeTimer };
}

export async function rehydrateFromDb() {
  const [projects, entries, settingsRow, timerRow] = await Promise.all([
    getAll('projects'),
    readEntriesByStartDesc(),
    getOne('settings', 'default'),
    getOne('timer', 'active')
  ]);

  const { validProjects, validEntries, safeSettings, safeTimer } = coerceAndValidateRows({
    projects,
    entries,
    settingsRow,
    timerRow
  });

  setState((draft) => {
    draft.projects = validProjects.sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
    draft.entries = validEntries;
    draft.settings = safeSettings;
    if (safeTimer?.startUtcMs) {
      draft.timer.isRunning = true;
      draft.timer.projectId = safeTimer.projectId ?? null;
      draft.timer.note = safeTimer.note ?? '';
      draft.timer.startUtcMs = safeTimer.startUtcMs;
      draft.timer.lastHeartbeatMs = safeTimer.lastHeartbeatMs || safeTimer.startUtcMs;
      draft.timer.elapsedMs = Math.max(0, Date.now() - safeTimer.startUtcMs);
    } else {
      draft.timer.isRunning = false;
      draft.timer.projectId = null;
      draft.timer.note = '';
      draft.timer.startUtcMs = 0;
      draft.timer.lastHeartbeatMs = 0;
      draft.timer.elapsedMs = 0;
    }
  });
}

export async function loadInitialState() {
  await ensureDefaults(defaultSettings);
  await rehydrateFromDb();
}

export function getProjectMap() {
  return new Map(state.projects.map((p) => [p.id, p]));
}
