import { ensureAuthBootstrap, clearAuthSession, getAuthSession } from './auth.js';
import { initTheme } from './theme.js';
import { getVaultStatus, initDb, lockAtRestEncryption, resetCorruptedVaultData, unlockAtRestEncryption } from './db.js';
import { loadInitialState, setState, subscribe, getState } from './state.js';
import { notify } from './notify.js';
import { renderTrackerView } from './ui/tracker-view.js';
import { renderEntriesView } from './ui/entries-view.js';
import { renderExportView } from './ui/export-view.js';
import { renderReportsView } from './ui/reports-view.js';
import { renderInvoiceView } from './ui/invoice-view.js';
import { renderSettingsView } from './ui/settings-view.js';
import { renderLoginView } from './ui/login-view.js';
import { initTimerEngine } from './timer.js';
import { passphraseDialog } from './ui/dialogs.js';

const main = document.getElementById('main');
const sidebar = document.querySelector('.sidebar');
const tabs = Array.from(document.querySelectorAll('[data-view]'));
const lockBanner = document.getElementById('lockBanner');
const logoutBtn = document.getElementById('logoutBtn');

let appDataReady = false;
let runtimeStarted = false;

function setAuthenticatedUi(session) {
  const loggedIn = Boolean(session);
  sidebar.hidden = !loggedIn;
  logoutBtn.hidden = !loggedIn;
}

function render() {
  const state = getState();
  const session = getAuthSession();
  setAuthenticatedUi(session);

  for (const tab of tabs) {
    if (tab.dataset.view === state.ui.activeView) {
      tab.classList.add('is-active');
    } else {
      tab.classList.remove('is-active');
    }
  }

  if (state.ui.lockBanner && session) {
    lockBanner.hidden = false;
    lockBanner.textContent = state.ui.lockBanner;
  } else {
    lockBanner.hidden = true;
    lockBanner.textContent = '';
  }

  main.replaceChildren();

  if (!session) {
    renderLoginView(main, {
      onLoginSuccess: async () => {
        await startAuthenticatedRuntime();
      }
    });
    return;
  }

  if (!appDataReady) {
    const loading = document.createElement('section');
    loading.className = 'card';
    const title = document.createElement('h2');
    title.textContent = 'Loading';
    const text = document.createElement('p');
    text.className = 'muted';
    text.textContent = 'Preparing your local workspace...';
    loading.append(title, text);
    main.append(loading);
    return;
  }

  const viewRenderers = new Map([
    ['tracker', renderTrackerView],
    ['entries', renderEntriesView],
    ['export', renderExportView],
    ['reports', renderReportsView],
    ['invoices', renderInvoiceView],
    ['settings', renderSettingsView]
  ]);
  const renderer = viewRenderers.get(state.ui.activeView);
  if (renderer) renderer(main);
}

function bindTabs() {
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      if (!view) return;
      setState((draft) => {
        draft.ui.activeView = view;
      });
    });
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function installVaultAutoLock() {
  let lastActivityMs = Date.now();
  const mark = () => { lastActivityMs = Date.now(); };
  window.addEventListener('pointerdown', mark, { passive: true });
  window.addEventListener('keydown', mark, { passive: true });
  window.addEventListener('mousemove', mark, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) mark();
  });

  setInterval(async () => {
    const state = getState();
    const mins = Number(state.settings.vaultAutoLockMinutes ?? 15);
    const thresholdMs = Math.max(1, mins) * 60000;
    const vault = await getVaultStatus();
    if (!vault.enabled || !vault.unlocked) return;
    if (Date.now() - lastActivityMs < thresholdMs) return;

    lockAtRestEncryption();
    setState((draft) => {
      draft.projects = [];
      draft.entries = [];
      draft.timer.isRunning = false;
      draft.timer.projectId = null;
      draft.timer.note = '';
      draft.timer.startUtcMs = 0;
      draft.timer.elapsedMs = 0;
      draft.timer.lastHeartbeatMs = 0;
    });
    notify('Vault auto-locked due to inactivity.', 'info', 1800);
  }, 60000);
}

function installVaultCrossTabSync() {
  window.addEventListener('storage', async (event) => {
    if (event.key !== 'hourzy:vault-version') return;
    const session = getAuthSession();
    if (!session) return;

    const vault = await getVaultStatus();
    if (vault.enabled && !vault.unlocked) {
      setState((draft) => {
        draft.projects = [];
        draft.entries = [];
        draft.timer.isRunning = false;
        draft.timer.projectId = null;
        draft.timer.note = '';
        draft.timer.startUtcMs = 0;
        draft.timer.elapsedMs = 0;
        draft.timer.lastHeartbeatMs = 0;
      });
      notify('Vault updated in another tab. Unlock to continue.', 'info', 2400);
      return;
    }

    if (vault.enabled && vault.unlocked) {
      await loadInitialState();
      notify('Vault data refreshed from another tab.', 'info', 1800);
    }
  });
}

async function ensureVaultUnlockedAtStartup() {
  const vault = await getVaultStatus();
  if (!vault.enabled || vault.unlocked) return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const passphrase = await passphraseDialog({
      title: 'Unlock Encrypted Local Data',
      message: `Enter your passphrase to unlock local encrypted records. Attempt ${attempt} of 3.`
    });
    if (!passphrase) break;

    try {
      await unlockAtRestEncryption(passphrase);
      return;
    } catch {
      // Retry up to three times.
    }
  }

  throw new Error('Encrypted local storage is locked. Reload and enter a valid passphrase to continue.');
}

async function startAuthenticatedRuntime() {
  appDataReady = false;
  render();
  await ensureVaultUnlockedAtStartup();
  await loadInitialState();

  if (!runtimeStarted) {
    initTimerEngine();
    installVaultAutoLock();
    installVaultCrossTabSync();
    runtimeStarted = true;
  }

  appDataReady = true;
  render();
}

function bindLogout() {
  logoutBtn.addEventListener('click', () => {
    clearAuthSession();
    lockAtRestEncryption();
    appDataReady = false;
    setState((draft) => {
      draft.projects = [];
      draft.entries = [];
      draft.timer.isRunning = false;
      draft.timer.projectId = null;
      draft.timer.note = '';
      draft.timer.startUtcMs = 0;
      draft.timer.elapsedMs = 0;
      draft.timer.lastHeartbeatMs = 0;
      draft.ui.activeView = 'tracker';
    });
    notify('Logged out.', 'info');
    render();
  });
}

async function boot() {
  initTheme();
  await initDb();
  await ensureAuthBootstrap();
  bindTabs();
  bindLogout();
  registerServiceWorker();
  subscribe(render);

  if (getAuthSession()) {
    await startAuthenticatedRuntime();
  } else {
    render();
  }
}

boot().catch((error) => {
  main.replaceChildren();
  const card = document.createElement('section');
  card.className = 'card';
  const title = document.createElement('h2');
  title.textContent = 'Startup Error';
  const text = document.createElement('p');
  text.className = 'muted';
  text.textContent = error?.message || 'Unexpected failure while starting the app.';
  card.append(title, text);

  const canRecover = /encrypted local storage|corrupted encrypted local data|wrong passphrase/i.test(String(error?.message || ''));
  if (canRecover) {
    const recoverText = document.createElement('p');
    recoverText.className = 'muted';
    recoverText.textContent = 'Recovery mode will reset encrypted local records and disable at-rest encryption.';
    const recoverBtn = document.createElement('button');
    recoverBtn.className = 'danger';
    recoverBtn.textContent = 'Recovery Reset';
    recoverBtn.addEventListener('click', async () => {
      await resetCorruptedVaultData();
      location.reload();
    });
    card.append(recoverText, recoverBtn);
  }
  main.append(card);
});
