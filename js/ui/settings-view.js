import { THEMES, applyTheme, getSavedTheme } from '../theme.js';
import { upsertProject } from '../entries.js';
import { changeOwnPassword, createUser, deleteUser, getAuthSession, listUsers, resetUserPassword } from '../auth.js';
import { disableAtRestEncryption, enableAtRestEncryption, getVaultStatus, lockAtRestEncryption, pruneEntriesBefore, resetCorruptedVaultData, unlockAtRestEncryption } from '../db.js';
import { importBackupFile } from '../import.js';
import { notify } from '../notify.js';
import { updateSettings } from '../settings.js';
import { getBrowserSupportReport } from '../support.js';
import { analyzeTabularFile, downloadCsvTemplate, importTabularAnalysis } from '../tabular-import.js';
import { getState, rehydrateFromDb, setState } from '../state.js';
import { reconcileTimerRuntime } from '../timer.js';
import { confirmDialog, passphraseDialog, tabularMappingDialog, textInputDialog } from './dialogs.js';

function dateInputValueFromUtcMs(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function renderSettingsView(root) {
  const state = getState();
  const session = getAuthSession();

  // ------------------------------------------------------------------
  // Helper: password field with reveal toggle
  // ------------------------------------------------------------------
  function makeRevealField(id, labelText) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.textContent = labelText;
    const inputWrap = document.createElement('div');
    inputWrap.className = 'input-reveal';
    const input = document.createElement('input');
    input.id = id;
    input.type = 'password';
    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'reveal-btn';
    revealBtn.textContent = 'Show';
    revealBtn.setAttribute('aria-label', 'Toggle password visibility');
    revealBtn.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      revealBtn.textContent = isHidden ? 'Hide' : 'Show';
    });
    inputWrap.append(input, revealBtn);
    wrap.append(lbl, inputWrap);
    return { wrap, input };
  }

  const appSettingsCard = document.createElement('section');
  appSettingsCard.className = 'card';
  const title = document.createElement('h2');
  title.textContent = 'General';

  const form = document.createElement('form');

  const tzField = document.createElement('div');
  tzField.className = 'field';
  const tzLabel = document.createElement('label');
  tzLabel.htmlFor = 'setTimezone';
  tzLabel.textContent = 'Timezone';
  const tzInput = document.createElement('input');
  tzInput.id = 'setTimezone';
  tzInput.value = state.settings.timezone;
  tzField.append(tzLabel, tzInput);

  const wsField = document.createElement('div');
  wsField.className = 'field';
  const wsLabel = document.createElement('label');
  wsLabel.htmlFor = 'setWeekStart';
  wsLabel.textContent = 'Week starts on';
  const wsSelect = document.createElement('select');
  wsSelect.id = 'setWeekStart';
  const optMon = document.createElement('option');
  optMon.value = '1';
  optMon.textContent = 'Monday';
  const optSun = document.createElement('option');
  optSun.value = '0';
  optSun.textContent = 'Sunday';
  wsSelect.append(optMon, optSun);
  wsSelect.value = String(state.settings.weekStartsOn);
  wsField.append(wsLabel, wsSelect);

  const roundingField = document.createElement('div');
  roundingField.className = 'field';
  const roundingLabel = document.createElement('label');
  roundingLabel.htmlFor = 'setRounding';
  roundingLabel.textContent = 'Rounding';
  const roundingSelect = document.createElement('select');
  roundingSelect.id = 'setRounding';
  for (const minute of [0, 5, 10, 15]) {
    const option = document.createElement('option');
    option.value = String(minute);
    option.textContent = minute === 0 ? 'No rounding' : `${minute} minutes`;
    roundingSelect.append(option);
  }
  roundingSelect.value = String(state.settings.roundingMinutes);
  roundingField.append(roundingLabel, roundingSelect);

  const idleField = document.createElement('div');
  idleField.className = 'field inline';
  const idleLabel = document.createElement('label');
  idleLabel.htmlFor = 'setIdleDetection';
  idleLabel.textContent = 'Idle detection (10 min prompt)';
  const idleCheckbox = document.createElement('input');
  idleCheckbox.id = 'setIdleDetection';
  idleCheckbox.type = 'checkbox';
  idleCheckbox.checked = Boolean(state.settings.idleDetectionEnabled);
  idleField.append(idleCheckbox, idleLabel);

  const reminderField = document.createElement('div');
  reminderField.className = 'field inline';
  const reminderLabel = document.createElement('label');
  reminderLabel.htmlFor = 'setReminder';
  reminderLabel.textContent = 'Daily reminder at/after 6PM';
  const reminderCheckbox = document.createElement('input');
  reminderCheckbox.id = 'setReminder';
  reminderCheckbox.type = 'checkbox';
  reminderCheckbox.checked = Boolean(state.settings.dailyReminderEnabled);
  reminderField.append(reminderCheckbox, reminderLabel);

  const autoLockField = document.createElement('div');
  autoLockField.className = 'field';
  const autoLockLabel = document.createElement('label');
  autoLockLabel.htmlFor = 'setVaultAutoLock';
  autoLockLabel.textContent = 'Vault auto-lock (minutes)';
  const autoLockInput = document.createElement('input');
  autoLockInput.id = 'setVaultAutoLock';
  autoLockInput.type = 'number';
  autoLockInput.min = '1';
  autoLockInput.max = '240';
  autoLockInput.step = '1';
  autoLockInput.value = String(state.settings.vaultAutoLockMinutes ?? 15);
  autoLockField.append(autoLockLabel, autoLockInput);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'primary';
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save settings';

  // Row 1: Timezone (wide) | Week starts on | Rounding
  const topRow = document.createElement('div');
  topRow.className = 'settings-row';
  tzField.classList.add('wide');
  topRow.append(tzField, wsField, roundingField);

  // Row 2: Idle | Reminder | Vault auto-lock | Save button
  const bottomRow = document.createElement('div');
  bottomRow.className = 'settings-row';
  bottomRow.style.alignItems = 'center';
  autoLockField.style.minWidth = '160px';
  saveBtn.style.flexShrink = '0';
  bottomRow.append(idleField, reminderField, autoLockField, saveBtn);

  form.append(topRow, bottomRow);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await updateSettings({
        timezone: tzInput.value.trim() || state.settings.timezone,
        weekStartsOn: Number(wsSelect.value),
        roundingMinutes: Number(roundingSelect.value),
        idleDetectionEnabled: idleCheckbox.checked,
        dailyReminderEnabled: reminderCheckbox.checked,
        vaultAutoLockMinutes: Number(autoLockInput.value)
      });
      notify('Settings saved.', 'success');
    } catch (error) {
      notify(error.message || 'Failed to save settings.', 'error');
    }
  });

  appSettingsCard.append(title, form);

  const accountCard = document.createElement('section');
  accountCard.className = 'card';
  const accountTitle = document.createElement('h2');
  accountTitle.textContent = 'Change password';
  const accountForm = document.createElement('form');

  const { wrap: currentPasswordField, input: currentPasswordInput } = makeRevealField('currentPassword', 'Current password');
  currentPasswordInput.required = true;

  const { wrap: newPasswordField, input: newPasswordInput } = makeRevealField('newPassword', 'New password');
  newPasswordInput.minLength = 8;
  newPasswordInput.required = true;

  const { wrap: confirmPasswordField, input: confirmPasswordInput } = makeRevealField('confirmPassword', 'Confirm new password');
  confirmPasswordInput.minLength = 8;
  confirmPasswordInput.required = true;

  const changePasswordBtn = document.createElement('button');
  changePasswordBtn.className = 'primary';
  changePasswordBtn.type = 'submit';
  changePasswordBtn.textContent = 'Change password';

  const pwRow = document.createElement('div');
  pwRow.className = 'grid three';
  pwRow.append(currentPasswordField, newPasswordField, confirmPasswordField);

  accountForm.append(pwRow, changePasswordBtn);
  accountCard.append(accountTitle, accountForm);

  accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      if (newPasswordInput.value !== confirmPasswordInput.value) {
        throw new Error('New password confirmation does not match.');
      }
      await changeOwnPassword(session, {
        currentPassword: currentPasswordInput.value,
        newPassword: newPasswordInput.value
      });
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      confirmPasswordInput.value = '';
      notify('Password changed.', 'success');
    } catch (error) {
      notify(error.message || 'Could not change password.', 'error');
    }
  });

  const projectCard = document.createElement('section');
  projectCard.className = 'card';
  const pTitle = document.createElement('h2');
  pTitle.textContent = 'Projects';

  const pForm = document.createElement('form');

  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'projectName';
  nameLabel.textContent = 'Project name';
  const nameInput = document.createElement('input');
  nameInput.id = 'projectName';
  nameInput.maxLength = 80;
  nameInput.required = true;
  nameField.append(nameLabel, nameInput);

  const rateField = document.createElement('div');
  rateField.className = 'field';
  const rateLabel = document.createElement('label');
  rateLabel.htmlFor = 'projectRate';
  rateLabel.textContent = 'Hourly rate (optional)';
  const rateInput = document.createElement('input');
  rateInput.id = 'projectRate';
  rateInput.type = 'number';
  rateInput.min = '0';
  rateInput.step = '0.01';
  rateField.append(rateLabel, rateInput);

  const addBtn = document.createElement('button');
  addBtn.className = 'primary';
  addBtn.type = 'submit';
  addBtn.textContent = 'Add project';

  const addRow = document.createElement('div');
  addRow.className = 'project-add-row';
  addRow.append(nameField, rateField, addBtn);
  pForm.append(addRow);

  const projectListSep = document.createElement('hr');
  projectListSep.className = 'section-sep';
  const projectListLabel = document.createElement('p');
  projectListLabel.className = 'list-header';
  projectListLabel.textContent = state.projects.length ? `Projects (${state.projects.length})` : 'No projects yet';

  const list = document.createElement('div');
  list.className = 'list';
  for (const project of state.projects) {
    const item = document.createElement('article');
    item.className = 'list-item';

    const main = document.createElement('div');
    main.className = 'list-main';
    const n = document.createElement('p');
    n.textContent = project.name;
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = project.hourlyRate == null ? 'No rate' : `$${project.hourlyRate.toFixed(2)} / h`;
    main.append(n, meta);

    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'sm';
    archiveBtn.textContent = project.archived ? 'Unarchive' : 'Archive';
    archiveBtn.addEventListener('click', async () => {
      await upsertProject({
        id: project.id,
        name: project.name,
        hourlyRate: project.hourlyRate,
        archived: !project.archived
      });
    });

    item.append(main, archiveBtn);
    list.append(item);
  }

  pForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await upsertProject({
        name: nameInput.value,
        hourlyRate: rateInput.value,
        archived: false
      });
      nameInput.value = '';
      rateInput.value = '';
    } catch (error) {
      notify(error.message || 'Could not add project.', 'error');
    }
  });

  projectCard.append(pTitle, pForm, projectListSep, projectListLabel, list);

  let usersCard = null;
  if (session?.role === 'superadmin') {
    usersCard = document.createElement('section');
    usersCard.className = 'card';
    const uTitle = document.createElement('h2');
    uTitle.textContent = 'Users';

    const uForm = document.createElement('form');

    const uNameField = document.createElement('div');
    uNameField.className = 'field';
    const uNameLabel = document.createElement('label');
    uNameLabel.htmlFor = 'newUsername';
    uNameLabel.textContent = 'Username';
    const uNameInput = document.createElement('input');
    uNameInput.id = 'newUsername';
    uNameInput.required = true;
    uNameInput.minLength = 3;
    uNameField.append(uNameLabel, uNameInput);

    const uRoleField = document.createElement('div');
    uRoleField.className = 'field';
    const uRoleLabel = document.createElement('label');
    uRoleLabel.htmlFor = 'newUserRole';
    uRoleLabel.textContent = 'Role';
    const uRoleSelect = document.createElement('select');
    uRoleSelect.id = 'newUserRole';
    const adminOpt = document.createElement('option');
    adminOpt.value = 'admin';
    adminOpt.textContent = 'Admin';
    const userOpt = document.createElement('option');
    userOpt.value = 'user';
    userOpt.textContent = 'User';
    uRoleSelect.append(adminOpt, userOpt);
    uRoleField.append(uRoleLabel, uRoleSelect);

    const { wrap: uPassField, input: uPassInput } = makeRevealField('newUserPassword', 'Password');
    uPassInput.required = true;
    uPassInput.minLength = 8;

    const { wrap: uConfirmPassField, input: uConfirmPassInput } = makeRevealField('newUserPasswordConfirm', 'Confirm password');

    const createBtn = document.createElement('button');
    createBtn.className = 'primary';
    createBtn.type = 'submit';
    createBtn.textContent = 'Create user';

    const resetForm = document.createElement('form');
    const resetTitle = document.createElement('h3');
    resetTitle.textContent = 'Reset password';
    const resetUserField = document.createElement('div');
    resetUserField.className = 'field';
    const resetUserLabel = document.createElement('label');
    resetUserLabel.htmlFor = 'resetUserId';
    resetUserLabel.textContent = 'User';
    const resetUserSelect = document.createElement('select');
    resetUserSelect.id = 'resetUserId';
    resetUserField.append(resetUserLabel, resetUserSelect);

    const { wrap: resetPassField, input: resetPassInput } = makeRevealField('resetUserPassword', 'New password');
    resetPassInput.minLength = 8;
    resetPassInput.required = true;

    const resetBtn = document.createElement('button');
    resetBtn.className = 'danger';
    resetBtn.type = 'submit';
    resetBtn.textContent = 'Reset password';

    const deleteForm = document.createElement('form');
    deleteForm.className = 'grid';
    const deleteTitle = document.createElement('h3');
    deleteTitle.textContent = 'Disable user';
    const deleteUserField = document.createElement('div');
    deleteUserField.className = 'field';
    const deleteUserLabel = document.createElement('label');
    deleteUserLabel.htmlFor = 'deleteUserId';
    deleteUserLabel.textContent = 'User';
    const deleteUserSelect = document.createElement('select');
    deleteUserSelect.id = 'deleteUserId';
    deleteUserField.append(deleteUserLabel, deleteUserSelect);
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger';
    deleteBtn.type = 'submit';
    deleteBtn.textContent = 'Disable user';

    const userList = document.createElement('div');
    userList.className = 'list';

    const renderUsers = async () => {
      userList.replaceChildren();
      try {
        const users = await listUsers(session);
        resetUserSelect.replaceChildren();
        deleteUserSelect.replaceChildren();
        for (const user of users) {
          const opt = document.createElement('option');
          opt.value = user.id;
          opt.textContent = `${user.username} (${user.role})`;
          resetUserSelect.append(opt);
          const deleteOpt = document.createElement('option');
          deleteOpt.value = user.id;
          deleteOpt.textContent = `${user.username} (${user.role})`;
          deleteUserSelect.append(deleteOpt);

          const item = document.createElement('article');
          item.className = 'list-item';
          const main = document.createElement('div');
          main.className = 'list-main';
          const line1 = document.createElement('p');
          line1.textContent = user.username;
          const line2 = document.createElement('p');
          line2.className = 'muted';
          line2.textContent = `${user.role} | ${user.isActive ? 'active' : 'disabled'}`;
          main.append(line1, line2);
          item.append(main);
          userList.append(item);
        }
      } catch (error) {
        const e = document.createElement('p');
        e.className = 'muted';
        e.textContent = error.message || 'Failed to load users.';
        userList.append(e);
      }
    };

    uForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        if (uPassInput.value && uConfirmPassInput.value !== uPassInput.value) {
          notify('Passwords do not match.', 'error');
          return;
        }
        await createUser(session, {
          username: uNameInput.value,
          password: uPassInput.value,
          role: uRoleSelect.value
        });
        uNameInput.value = '';
        uPassInput.value = '';
        uConfirmPassInput.value = '';
        notify('User created.', 'success');
        await renderUsers();
      } catch (error) {
        notify(error.message || 'Failed to create user.', 'error');
      }
    });

    resetForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await resetUserPassword(session, {
          userId: resetUserSelect.value,
          newPassword: resetPassInput.value
        });
        resetPassInput.value = '';
        notify('Password reset.', 'success');
      } catch (error) {
        notify(error.message || 'Failed to reset password.', 'error');
      }
    });

    deleteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await deleteUser(session, { userId: deleteUserSelect.value });
        notify('User disabled.', 'success');
        await renderUsers();
      } catch (error) {
        notify(error.message || 'Failed to disable user.', 'error');
      }
    });

    renderUsers().catch(() => {});
    const resetSep = document.createElement('hr');
    resetSep.className = 'section-sep';
    const deleteSep = document.createElement('hr');
    deleteSep.className = 'section-sep';
    const userListSep = document.createElement('hr');
    userListSep.className = 'section-sep';
    const userListLabel = document.createElement('p');
    userListLabel.className = 'list-header';
    userListLabel.textContent = 'All Users';

    const uRow1 = document.createElement('div');
    uRow1.className = 'grid two';
    uRow1.append(uNameField, uRoleField);
    const uRow2 = document.createElement('div');
    uRow2.className = 'grid two';
    uRow2.append(uPassField, uConfirmPassField);
    uForm.append(uRow1, uRow2, createBtn);

    const resetRow = document.createElement('div');
    resetRow.className = 'grid two';
    resetRow.append(resetUserField, resetPassField);
    resetForm.append(resetTitle, resetRow, resetBtn);
    deleteForm.append(deleteTitle, deleteUserField, deleteBtn);
    usersCard.append(uTitle, uForm, resetSep, resetForm, deleteSep, deleteForm, userListSep, userListLabel, userList);
  }

  const dataCard = document.createElement('section');
  dataCard.className = 'card';
  const dTitle = document.createElement('h2');
  dTitle.textContent = 'Data';
  const dText = document.createElement('p');
  dText.className = 'muted';
  dText.textContent = 'Importing backup will replace current local data.';

  // Import & export column
  const importGroup = document.createElement('div');
  importGroup.className = 'btn-group';
  const importGroupLabel = document.createElement('h3');
  importGroupLabel.textContent = 'Data';
  const importBtn = document.createElement('button');
  importBtn.textContent = 'Import JSON backup';
  const importTabularBtn = document.createElement('button');
  importTabularBtn.textContent = 'Import CSV / Excel';
  const templateBtn = document.createElement('button');
  templateBtn.textContent = 'Download CSV template';
  importGroup.append(importGroupLabel, importBtn, importTabularBtn, templateBtn);

  // Maintenance column
  const maintenanceGroup = document.createElement('div');
  maintenanceGroup.className = 'btn-group';
  const maintenanceLabel = document.createElement('h3');
  maintenanceLabel.textContent = 'Maintenance';
  const pruneBtn = document.createElement('button');
  pruneBtn.textContent = 'Prune old entries';
  maintenanceGroup.append(maintenanceLabel, pruneBtn);

  // Encryption column
  const encryptionGroup = document.createElement('div');
  encryptionGroup.className = 'btn-group';
  const encryptionLabel = document.createElement('h3');
  encryptionLabel.textContent = 'Local encryption';
  const vaultBtn = document.createElement('button');
  vaultBtn.textContent = 'Loading vault state...';
  vaultBtn.disabled = true;
  const recoverBtn = document.createElement('button');
  recoverBtn.className = 'danger';
  recoverBtn.textContent = 'Reset corrupted vault';
  encryptionGroup.append(encryptionLabel, vaultBtn, recoverBtn);

  const fileInput = document.getElementById('importFileInput');
  const tabularInput = document.getElementById('tabularFileInput');

  importBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const confirmed = await confirmDialog({
      title: 'Restore Backup',
      message: 'Restore backup and overwrite current local data?',
      confirmText: 'Restore',
      danger: true
    });
    if (!confirmed) return;
    try {
      await importBackupFile(file, () => passphraseDialog({
        title: 'Encrypted Backup',
        message: 'Enter the passphrase used to encrypt this backup.'
      }));
      await rehydrateFromDb();
      reconcileTimerRuntime();
      notify('Backup restored.', 'success');
    } catch (error) {
      notify(error.message || 'Backup restore failed.', 'error');
    }
  };

  importTabularBtn.addEventListener('click', () => {
    tabularInput.value = '';
    tabularInput.click();
  });

  templateBtn.addEventListener('click', () => {
    downloadCsvTemplate();
  });

  tabularInput.onchange = async () => {
    const file = tabularInput.files?.[0];
    if (!file) return;
    try {
      const analysis = await analyzeTabularFile(file);
      const mapping = await tabularMappingDialog({ analysis });
      if (!mapping) return;
      const result = await importTabularAnalysis(analysis, { mapping });
      await rehydrateFromDb();
      reconcileTimerRuntime();
      if (result.created > 0) {
        setState((draft) => {
          draft.ui.activeView = 'entries';
          draft.ui.filters.projectId = 'all';
          draft.ui.filters.from = dateInputValueFromUtcMs(result.minStartUtcMs);
          draft.ui.filters.to = dateInputValueFromUtcMs(result.maxEndUtcMs);
        });
      } else {
        notify(
          `Imported 0/${result.totalRows}. This workbook has many non-work rows. Ensure Day maps to Day and Duration maps to Hours.`,
          'error',
          6500
        );
        return;
      }
      notify(
        `Imported ${result.created}/${result.totalRows} rows (${result.skipped} skipped, ${result.invalid} invalid, ${result.createdProjects} new projects).`,
        'success',
        4500
      );
    } catch (error) {
      notify(error.message || 'CSV/Excel import failed.', 'error');
    }
  };

  pruneBtn.addEventListener('click', async () => {
    const cutoff = await textInputDialog({
      title: 'Prune Old Entries',
      message: 'Delete entries before this local date.',
      label: 'Cutoff Date (YYYY-MM-DD)',
      placeholder: '2026-01-01'
    });
    if (!cutoff) return;
    const ms = new Date(`${cutoff}T00:00:00`).getTime();
    if (!Number.isFinite(ms)) {
      notify('Invalid date.', 'error');
      return;
    }
    const confirmed = await confirmDialog({
      title: 'Prune Old Entries',
      message: `Delete all entries ending before ${cutoff}?`,
      confirmText: 'Prune',
      danger: true
    });
    if (!confirmed) return;
    await pruneEntriesBefore(ms);
    await rehydrateFromDb();
    reconcileTimerRuntime();
    notify('Old entries removed.', 'success');
  });

  recoverBtn.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Reset Encrypted Vault',
      message: 'This removes encrypted local records and disables local encryption. Continue?',
      confirmText: 'Reset Vault',
      danger: true
    });
    if (!confirmed) return;
    await resetCorruptedVaultData();
    await rehydrateFromDb();
    reconcileTimerRuntime();
    notify('Vault reset complete.', 'success');
    await refreshVaultButton();
  });

  const dataGrid = document.createElement('div');
  dataGrid.className = 'grid three';
  dataGrid.style.alignItems = 'start';
  dataGrid.append(importGroup, maintenanceGroup, encryptionGroup);
  dataCard.append(dTitle, dText, dataGrid);

  const refreshVaultButton = async () => {
    const status = await getVaultStatus();
    if (!status.enabled) {
      vaultBtn.textContent = 'Enable Local Encryption';
      vaultBtn.disabled = false;
      vaultBtn.dataset.action = 'enable';
      return;
    }

    if (status.unlocked) {
      vaultBtn.textContent = 'Lock / Disable Encryption';
      vaultBtn.disabled = false;
      vaultBtn.dataset.action = 'lock-disable';
      return;
    }

    vaultBtn.textContent = 'Unlock Local Encryption';
    vaultBtn.disabled = false;
    vaultBtn.dataset.action = 'unlock';
  };

  vaultBtn.addEventListener('click', async () => {
    try {
      const action = vaultBtn.dataset.action;
      if (action === 'enable') {
        const passphrase = await passphraseDialog({
          title: 'Enable Local Encryption',
          message: 'Set a passphrase (minimum 8 chars). Keep it safe; it cannot be recovered.'
        });
        if (!passphrase) return;
        await enableAtRestEncryption(passphrase);
        await rehydrateFromDb();
        reconcileTimerRuntime();
        notify('Local encryption enabled.', 'success');
      } else if (action === 'unlock') {
        const passphrase = await passphraseDialog({
          title: 'Unlock Local Encryption',
          message: 'Enter your encryption passphrase.'
        });
        if (!passphrase) return;
        await unlockAtRestEncryption(passphrase);
        await rehydrateFromDb();
        reconcileTimerRuntime();
        notify('Encrypted local data unlocked.', 'success');
      } else if (action === 'lock-disable') {
        const disable = await confirmDialog({
          title: 'Disable Local Encryption',
          message: 'Disable encryption and move data back to plaintext browser storage?',
          confirmText: 'Disable',
          danger: true
        });
        if (disable) {
          const passphrase = await passphraseDialog({
            title: 'Confirm Disable',
            message: 'Enter passphrase to decrypt and disable local encryption.'
          });
          if (!passphrase) return;
          await disableAtRestEncryption(passphrase);
          await rehydrateFromDb();
          reconcileTimerRuntime();
          notify('Local encryption disabled.', 'success');
        } else {
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
          notify('Local encryption locked.', 'success');
        }
      }
      await refreshVaultButton();
    } catch (error) {
      notify(error.message || 'Vault operation failed.', 'error');
      await refreshVaultButton();
    }
  });

  refreshVaultButton().catch(() => {});

  const privacyCard = document.createElement('section');
  privacyCard.className = 'card';
  const privacyTitle = document.createElement('h2');
  privacyTitle.textContent = 'Local data limits';
  const privacyText = document.createElement('p');
  privacyText.className = 'muted';
  privacyText.textContent = 'Data is stored locally in this browser profile. A compromised device or browser extension can access local data.';
  const privacyList = document.createElement('ul');
  const li1 = document.createElement('li');
  li1.textContent = 'No server account recovery exists for local data.';
  const li2 = document.createElement('li');
  li2.textContent = 'Encrypted backups require your passphrase; forgotten passphrases cannot be recovered.';
  const li3 = document.createElement('li');
  li3.textContent = 'Local records are not tamper-proof compliance logs.';
  privacyList.append(li1, li2, li3);
  privacyCard.append(privacyTitle, privacyText, privacyList);

  const supportCard = document.createElement('section');
  supportCard.className = 'card';
  const supportTitle = document.createElement('h2');
  supportTitle.textContent = 'Browser support';
  const supportBody = document.createElement('div');
  supportBody.className = 'list';
  const supportRefresh = document.createElement('button');
  supportRefresh.textContent = 'Refresh check';

  async function renderSupport() {
    const report = await getBrowserSupportReport();
    supportBody.replaceChildren();
    const items = [
      `IndexedDB: ${report.indexedDb ? 'OK' : 'Unavailable'}`,
      `Web Crypto: ${report.webCrypto ? 'OK' : 'Unavailable'}`,
      `BroadcastChannel: ${report.broadcastChannel ? 'OK' : 'Unavailable'}`,
      `Service Worker: ${report.serviceWorker ? 'OK' : 'Unavailable'}`
    ];
    for (const text of items) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = text;
      supportBody.append(p);
    }
    if (report.issues.length) {
      for (const issue of report.issues) {
        const warn = document.createElement('p');
        warn.className = 'muted';
        warn.textContent = `Issue: ${issue}`;
        supportBody.append(warn);
      }
    }
  }

  supportRefresh.addEventListener('click', () => {
    renderSupport().catch(() => {});
  });
  renderSupport().catch(() => {});
  supportCard.append(supportTitle, supportBody, supportRefresh);

  // --- Theme picker ---
  const themeCard = document.createElement('section');
  themeCard.className = 'card';
  const themeTitle = document.createElement('h2');
  themeTitle.textContent = 'Appearance';
  const themeGrid = document.createElement('div');
  themeGrid.className = 'theme-grid';

  let activeTheme = getSavedTheme();

  THEMES.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch' + (t.id === activeTheme ? ' is-active' : '');
    btn.setAttribute('aria-label', `Switch to ${t.name} theme`);
    btn.type = 'button';

    const preview = document.createElement('div');
    preview.className = 'theme-preview';
    t.preview.forEach((color) => {
      const dot = document.createElement('div');
      dot.className = 'theme-preview-dot';
      dot.style.background = color;
      preview.append(dot);
    });

    const name = document.createElement('div');
    name.className = 'theme-name';
    name.textContent = t.name;

    const desc = document.createElement('div');
    desc.className = 'theme-desc';
    desc.textContent = t.description;

    btn.append(preview, name, desc);
    btn.addEventListener('click', () => {
      applyTheme(t.id);
      activeTheme = t.id;
      themeGrid.querySelectorAll('.theme-swatch').forEach((s) => s.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
    themeGrid.append(btn);
  });

  themeCard.append(themeTitle, themeGrid);

  // --- Page heading ---
  const pageHeader = document.createElement('div');
  const pageTitle = document.createElement('h1');
  pageTitle.className = 'page-title';
  pageTitle.textContent = 'Settings';
  const pageSubtitle = document.createElement('p');
  pageSubtitle.className = 'page-subtitle';
  pageSubtitle.textContent = 'Manage preferences, projects, and local data.';
  pageHeader.append(pageTitle, pageSubtitle);

  // --- Inner settings tabs ---
  const tabDefs = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'projects', label: 'Projects' },
    ...(usersCard ? [{ id: 'users', label: 'Users' }] : []),
    { id: 'data', label: 'Data' },
    { id: 'security', label: 'Security' },
  ];

  const settingsTabs = document.createElement('div');
  settingsTabs.className = 'settings-tabs';
  settingsTabs.setAttribute('role', 'tablist');

  const panelMap = {
    general: document.createElement('div'),
    appearance: document.createElement('div'),
    projects: document.createElement('div'),
    data: document.createElement('div'),
    security: document.createElement('div'),
  };
  if (usersCard) panelMap.users = document.createElement('div');

  panelMap.general.className = 'settings-panel is-active';
  panelMap.general.append(appSettingsCard);

  panelMap.appearance.className = 'settings-panel';
  panelMap.appearance.append(themeCard);

  panelMap.projects.className = 'settings-panel';
  panelMap.projects.append(projectCard);

  if (usersCard) {
    panelMap.users.className = 'settings-panel';
    panelMap.users.append(usersCard);
  }

  panelMap.data.className = 'settings-panel';
  panelMap.data.append(dataCard);

  panelMap.security.className = 'settings-panel';
  panelMap.security.append(accountCard, privacyCard, supportCard);

  let activeTab = 'general';

  tabDefs.forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.className = 'settings-tab' + (id === activeTab ? ' is-active' : '');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', id === activeTab ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if (activeTab === id) return;
      panelMap[activeTab].classList.remove('is-active');
      const prevBtn = settingsTabs.querySelector('.settings-tab.is-active');
      if (prevBtn) {
        prevBtn.classList.remove('is-active');
        prevBtn.setAttribute('aria-selected', 'false');
      }
      activeTab = id;
      panelMap[id].classList.add('is-active');
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
    });
    settingsTabs.append(btn);
  });

  const panelContainer = document.createElement('div');
  Object.values(panelMap).forEach((p) => panelContainer.append(p));

  root.append(pageHeader, settingsTabs, panelContainer);
}
