import { deleteOne, putOne } from './db.js';
import { createTimerEntry } from './entries.js';
import { notify } from './notify.js';
import { getState, setState } from './state.js';
import { confirmDialog } from './ui/dialogs.js';
import { validateTimerSnapshot } from './validation.js';

const LOCK_KEY = 'hourzy:timer-lock';
const LOCK_STALE_MS = 30000;
const HEARTBEAT_MS = 20000;
const IDLE_THRESHOLD_MS = 10 * 60 * 1000;
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hourzy-timer') : null;
const tabId = crypto.randomUUID();

let tickInterval = null;
let heartbeatInterval = null;
let reminderInterval = null;
let idleInterval = null;
let lastReminderDate = '';
let lastUserActivityMs = Date.now();
let idlePromptOpen = false;
let lastIdlePromptAtMs = 0;

function getLock() {
  const raw = localStorage.getItem(LOCK_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isLockFresh(lock) {
  return lock && Date.now() - Number(lock.updatedAtMs || 0) < LOCK_STALE_MS;
}

function acquireLock() {
  const lock = getLock();
  if (isLockFresh(lock) && lock.tabId !== tabId) return false;
  const next = { tabId, updatedAtMs: Date.now() };
  localStorage.setItem(LOCK_KEY, JSON.stringify(next));
  channel?.postMessage({ type: 'lock', tabId });
  return true;
}

function refreshLock() {
  const lock = getLock();
  if (!lock || lock.tabId !== tabId) return;
  lock.updatedAtMs = Date.now();
  localStorage.setItem(LOCK_KEY, JSON.stringify(lock));
}

function releaseLock() {
  const lock = getLock();
  if (lock && lock.tabId === tabId) {
    localStorage.removeItem(LOCK_KEY);
    channel?.postMessage({ type: 'unlock', tabId });
  }
}

function updateBanner(message) {
  setState((draft) => {
    draft.ui.lockBanner = message;
  });
}

async function handleIdleCheck() {
  const state = getState();
  if (!state.settings.idleDetectionEnabled || !state.timer.isRunning || idlePromptOpen) return;
  if (document.hidden) return;

  const idleMs = Date.now() - lastUserActivityMs;
  if (idleMs < IDLE_THRESHOLD_MS) return;
  if (Date.now() - lastIdlePromptAtMs < IDLE_THRESHOLD_MS) return;

  idlePromptOpen = true;
  lastIdlePromptAtMs = Date.now();
  const idleMinutes = Math.floor(idleMs / 60000);
  const subtract = await confirmDialog({
    title: 'Idle Time Detected',
    message: `No activity for about ${idleMinutes} minutes. Subtract this idle time from the running timer?`,
    confirmText: 'Subtract'
  });

  if (subtract) {
    const nextStartUtcMs = state.timer.startUtcMs + idleMs;
    const nextSnapshot = {
      id: 'active',
      projectId: state.timer.projectId,
      note: state.timer.note,
      startUtcMs: nextStartUtcMs,
      lastHeartbeatMs: Date.now()
    };
    validateTimerSnapshot(nextSnapshot);
    await putOne('timer', nextSnapshot);
    setState((draft) => {
      draft.timer.startUtcMs = nextStartUtcMs;
      draft.timer.elapsedMs = Math.max(0, Date.now() - nextStartUtcMs);
    });
  }

  lastUserActivityMs = Date.now();
  idlePromptOpen = false;
}

function setTicking(enabled) {
  if (enabled && !tickInterval) {
    tickInterval = setInterval(() => {
      const timer = getState().timer;
      if (!timer.isRunning) return;
      const now = Date.now();
      const elapsed = now - timer.startUtcMs;
      setState((draft) => {
        draft.timer.elapsedMs = Math.max(0, elapsed);
      });
    }, 1000);
  }

  if (!enabled && tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }

  if (enabled && !heartbeatInterval) {
    heartbeatInterval = setInterval(async () => {
      const timer = getState().timer;
      if (!timer.isRunning) return;
      const now = Date.now();
      refreshLock();
      const snapshot = {
        id: 'active',
        projectId: timer.projectId,
        note: timer.note,
        startUtcMs: timer.startUtcMs,
        lastHeartbeatMs: now
      };
      validateTimerSnapshot(snapshot);
      await putOne('timer', snapshot);
      setState((draft) => {
        draft.timer.lastHeartbeatMs = now;
      });
    }, HEARTBEAT_MS);
  }

  if (!enabled && heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (enabled && !reminderInterval) {
    reminderInterval = setInterval(() => {
      const state = getState();
      if (!state.settings.dailyReminderEnabled || !state.timer.isRunning) return;
      const now = new Date();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (lastReminderDate === dateKey) return;
      if (now.getHours() >= 18) {
        lastReminderDate = dateKey;
        notify('Hourzy reminder: your timer is still running.', 'info');
      }
    }, 60000);
  }

  if (!enabled && reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }

  if (enabled && !idleInterval) {
    idleInterval = setInterval(() => {
      handleIdleCheck().catch(() => {});
    }, 60000);
  }

  if (!enabled && idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
    idlePromptOpen = false;
  }
}

export function reconcileTimerRuntime() {
  const state = getState();
  if (state.timer.isRunning) {
    if (acquireLock()) {
      setTicking(true);
      updateBanner('');
    } else {
      setState((draft) => {
        draft.timer.isRunning = false;
        draft.timer.projectId = null;
        draft.timer.note = '';
        draft.timer.startUtcMs = 0;
        draft.timer.elapsedMs = 0;
        draft.timer.lastHeartbeatMs = 0;
      });
      setTicking(false);
      updateBanner('Another tab controls the active timer.');
    }
  } else {
    setTicking(false);
    releaseLock();
    updateBanner('');
  }
}

export function initTimerEngine() {
  const markActivity = () => {
    lastUserActivityMs = Date.now();
  };
  window.addEventListener('pointerdown', markActivity, { passive: true });
  window.addEventListener('keydown', markActivity, { passive: true });
  window.addEventListener('mousemove', markActivity, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) markActivity();
  });

  const state = getState();

  if (state.timer.isRunning) {
    const skewed = Date.now() < state.timer.startUtcMs;
    if (skewed) updateBanner('System clock changed. Review the running timer.');

    const heartbeatAge = Date.now() - (state.timer.lastHeartbeatMs || state.timer.startUtcMs);
    const staleRecovery = heartbeatAge > 120000;
    if (staleRecovery) {
      setTimeout(async () => {
        const keep = await confirmDialog({
          title: 'Recovered Timer',
          message: 'Recovered a timer from a previous session. Keep it running?',
          confirmText: 'Keep Running'
        });
        if (!keep) {
          await discardTimer();
        }
      }, 0);
    }

    reconcileTimerRuntime();
  }

  channel?.addEventListener('message', (event) => {
    const stateNow = getState();
    if (event.data?.type === 'lock' && event.data.tabId !== tabId && stateNow.timer.isRunning) {
      updateBanner('Another tab controls the active timer.');
    }
    if (event.data?.type === 'unlock') {
      updateBanner('');
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== LOCK_KEY) return;
    const current = getLock();
    if (current && current.tabId !== tabId && getState().timer.isRunning) {
      updateBanner('Another tab controls the active timer.');
    } else {
      updateBanner('');
    }
  });

  window.addEventListener('beforeunload', () => {
    if (getState().timer.isRunning) refreshLock();
  });
}

export async function startTimer({ projectId, note }) {
  const state = getState();
  if (state.timer.isRunning) throw new Error('Timer is already running.');
  if (!acquireLock()) throw new Error('Another tab has an active timer.');

  const startUtcMs = Date.now();
  lastUserActivityMs = startUtcMs;
  const next = {
    id: 'active',
    projectId: projectId || null,
    note: note || '',
    startUtcMs,
    lastHeartbeatMs: startUtcMs
  };

  validateTimerSnapshot(next);
  await putOne('timer', next);
  setState((draft) => {
    draft.timer.isRunning = true;
    draft.timer.projectId = next.projectId;
    draft.timer.note = next.note;
    draft.timer.startUtcMs = startUtcMs;
    draft.timer.elapsedMs = 0;
    draft.timer.lastHeartbeatMs = startUtcMs;
  });

  setTicking(true);
  updateBanner('');
}

export async function stopTimer() {
  const state = getState();
  if (!state.timer.isRunning) throw new Error('No timer running.');

  const endUtcMs = Date.now();
  const created = await createTimerEntry({
    projectId: state.timer.projectId,
    note: state.timer.note,
    startUtcMs: state.timer.startUtcMs,
    endUtcMs,
    roundingMinutes: state.settings.roundingMinutes
  });

  await deleteOne('timer', 'active');
  setState((draft) => {
    draft.timer.isRunning = false;
    draft.timer.projectId = null;
    draft.timer.note = '';
    draft.timer.startUtcMs = 0;
    draft.timer.elapsedMs = 0;
    draft.timer.lastHeartbeatMs = 0;
  });

  setTicking(false);
  releaseLock();
  updateBanner('');
  return created;
}

export async function discardTimer() {
  await deleteOne('timer', 'active');
  setState((draft) => {
    draft.timer.isRunning = false;
    draft.timer.projectId = null;
    draft.timer.note = '';
    draft.timer.startUtcMs = 0;
    draft.timer.elapsedMs = 0;
    draft.timer.lastHeartbeatMs = 0;
  });
  setTicking(false);
  releaseLock();
  updateBanner('');
}

export async function updateTimerDraft({ projectId, note }) {
  const state = getState();
  if (!state.timer.isRunning) {
    setState((draft) => {
      draft.timer.projectId = projectId ?? draft.timer.projectId;
      draft.timer.note = note ?? draft.timer.note;
    });
    return;
  }

  const next = {
    id: 'active',
    projectId: projectId ?? state.timer.projectId,
    note: note ?? state.timer.note,
    startUtcMs: state.timer.startUtcMs,
    lastHeartbeatMs: Date.now()
  };

  validateTimerSnapshot(next);
  await putOne('timer', next);
  setState((draft) => {
    draft.timer.projectId = next.projectId;
    draft.timer.note = next.note;
    draft.timer.lastHeartbeatMs = next.lastHeartbeatMs;
  });
}
