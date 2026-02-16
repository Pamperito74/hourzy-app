import { exportEncryptedBackup, exportEntriesCsv, exportJsonBackup, filterEntries } from '../export.js';
import { notify } from '../notify.js';
import { getState } from '../state.js';
import { formatHours } from '../security.js';
import { splitDurationsByBucket, todayEntries } from '../totals.js';
import { passphraseDialog } from './dialogs.js';

export function renderExportView(root) {
  const state = getState();

  const card = document.createElement('section');
  card.className = 'card';

  const title = document.createElement('h2');
  title.textContent = 'Export';

  const filters = document.createElement('div');
  filters.className = 'grid two';

  const fromField = document.createElement('div');
  fromField.className = 'field';
  const fromLabel = document.createElement('label');
  fromLabel.htmlFor = 'exFrom';
  fromLabel.textContent = 'From';
  const fromInput = document.createElement('input');
  fromInput.id = 'exFrom';
  fromInput.type = 'date';
  fromInput.value = state.ui.filters.from || '';
  fromField.append(fromLabel, fromInput);

  const toField = document.createElement('div');
  toField.className = 'field';
  const toLabel = document.createElement('label');
  toLabel.htmlFor = 'exTo';
  toLabel.textContent = 'To';
  const toInput = document.createElement('input');
  toInput.id = 'exTo';
  toInput.type = 'date';
  toInput.value = state.ui.filters.to || '';
  toField.append(toLabel, toInput);

  const projectField = document.createElement('div');
  projectField.className = 'field';
  const projectLabel = document.createElement('label');
  projectLabel.htmlFor = 'exProject';
  projectLabel.textContent = 'Project';
  const projectSelect = document.createElement('select');
  projectSelect.id = 'exProject';
  const anyOpt = document.createElement('option');
  anyOpt.value = 'all';
  anyOpt.textContent = 'All projects';
  projectSelect.append(anyOpt);
  for (const project of state.projects) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.name;
    projectSelect.append(opt);
  }
  projectSelect.value = state.ui.filters.projectId || 'all';
  projectField.append(projectLabel, projectSelect);

  filters.append(fromField, toField, projectField);

  const filtered = filterEntries(state.entries, {
    from: fromInput.value,
    to: toInput.value,
    projectId: projectSelect.value,
    timeZone: state.settings.timezone
  });

  const totals = splitDurationsByBucket(filtered, state.settings);
  const today = todayEntries(filtered, state.settings);

  const stats = document.createElement('div');
  stats.className = 'grid two';

  const c1 = document.createElement('div');
  c1.className = 'card';
  const c1h = document.createElement('h3');
  c1h.textContent = 'Filtered Total';
  const c1s = document.createElement('p');
  c1s.className = 'stat';
  c1s.textContent = `${formatHours(filtered.reduce((acc, cur) => acc + cur.durationMs, 0))} h`;
  c1.append(c1h, c1s);

  const c2 = document.createElement('div');
  c2.className = 'card';
  const c2h = document.createElement('h3');
  c2h.textContent = 'Bucket Count';
  const c2s = document.createElement('p');
  c2s.className = 'muted';
  c2s.textContent = `${totals.day.size} days | ${totals.week.size} weeks | ${totals.month.size} months`;
  c2.append(c2h, c2s);

  stats.append(c1, c2);

  const actions = document.createElement('div');
  actions.className = 'row';

  const csvBtn = document.createElement('button');
  csvBtn.className = 'primary';
  csvBtn.textContent = 'Export CSV';

  const backupBtn = document.createElement('button');
  backupBtn.textContent = 'Export JSON Backup';
  const encryptedBackupBtn = document.createElement('button');
  encryptedBackupBtn.textContent = 'Export Encrypted Backup';

  const summaryBtn = document.createElement('button');
  summaryBtn.textContent = 'Copy Today Summary';

  actions.append(csvBtn, backupBtn, encryptedBackupBtn, summaryBtn);

  csvBtn.addEventListener('click', () => {
    exportEntriesCsv({
      entries: state.entries,
      projects: state.projects,
      settings: state.settings,
      filters: {
        from: fromInput.value,
        to: toInput.value,
        projectId: projectSelect.value
      }
    });
  });

  backupBtn.addEventListener('click', async () => {
    await exportJsonBackup();
  });

  encryptedBackupBtn.addEventListener('click', async () => {
    const passphrase = await passphraseDialog({
      title: 'Encrypt Backup',
      message: 'Use a passphrase with at least 8 characters. Keep it safe; there is no recovery.'
    });
    if (!passphrase) return;
    try {
      await exportEncryptedBackup(passphrase);
    } catch (error) {
      notify(error.message || 'Encrypted export failed.', 'error');
    }
  });

  summaryBtn.addEventListener('click', async () => {
    const map = new Map(state.projects.map((p) => [p.id, p.name]));
    const lines = ['Hourzy daily summary'];
    for (const entry of today) {
      const project = map.get(entry.projectId) || 'Unassigned';
      lines.push(`${project}: ${formatHours(entry.durationMs)} h`);
    }
    lines.push(`Total: ${formatHours(today.reduce((acc, cur) => acc + cur.durationMs, 0))} h`);
    const content = lines.join('\n');
    await navigator.clipboard.writeText(content);
    notify('Copied summary to clipboard.', 'success');
    setTimeout(async () => {
      try {
        const existing = await navigator.clipboard.readText();
        if (existing === content) {
          await navigator.clipboard.writeText('');
        }
      } catch {
        // Clipboard permissions may not allow read/write in all browsers.
      }
    }, 120000);
  });

  card.append(title, filters, stats, actions);
  root.append(card);
}
