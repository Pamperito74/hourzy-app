function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateProject(project) {
  if (!isObject(project)) throw new Error('Invalid project object.');
  if (typeof project.id !== 'string' || !project.id) throw new Error('Project id is required.');
  if (typeof project.name !== 'string' || !project.name.trim()) throw new Error('Project name is required.');
  if (typeof project.archived !== 'boolean') throw new Error('Project archived flag is invalid.');
  if (!(project.hourlyRate === null || Number.isFinite(project.hourlyRate))) {
    throw new Error('Project hourly rate is invalid.');
  }
  if (!Number.isFinite(project.createdAtMs) || !Number.isFinite(project.updatedAtMs)) {
    throw new Error('Project timestamp is invalid.');
  }
}

export function validateEntry(entry) {
  if (!isObject(entry)) throw new Error('Invalid entry object.');
  if (typeof entry.id !== 'string' || !entry.id) throw new Error('Entry id is required.');
  if (!(entry.projectId === null || typeof entry.projectId === 'string')) throw new Error('Entry project id is invalid.');
  if (typeof entry.note !== 'string') throw new Error('Entry note is invalid.');
  if (!Number.isFinite(entry.startUtcMs) || !Number.isFinite(entry.endUtcMs)) throw new Error('Entry timestamps are invalid.');
  if (entry.endUtcMs <= entry.startUtcMs) throw new Error('Entry end time must be after start time.');
  if (!Number.isFinite(entry.durationMs) || entry.durationMs !== entry.endUtcMs - entry.startUtcMs) {
    throw new Error('Entry duration is inconsistent.');
  }
  if (entry.source !== 'manual' && entry.source !== 'timer') throw new Error('Entry source is invalid.');
  if (!Number.isFinite(entry.createdAtMs) || !Number.isFinite(entry.updatedAtMs)) {
    throw new Error('Entry timestamp is invalid.');
  }
}

export function validateTimerSnapshot(timer) {
  if (!isObject(timer)) throw new Error('Invalid timer snapshot object.');
  if (timer.id !== 'active') throw new Error('Timer snapshot id is invalid.');
  if (!(timer.projectId === null || typeof timer.projectId === 'string')) throw new Error('Timer project id is invalid.');
  if (typeof timer.note !== 'string') throw new Error('Timer note is invalid.');
  if (!Number.isFinite(timer.startUtcMs)) throw new Error('Timer start time is invalid.');
  if (!Number.isFinite(timer.lastHeartbeatMs)) throw new Error('Timer heartbeat time is invalid.');
}

export function validateSettings(settings) {
  if (!isObject(settings)) throw new Error('Invalid settings object.');
  if (settings.id !== 'default') throw new Error('Settings id must be default.');
  if (typeof settings.timezone !== 'string' || !settings.timezone) throw new Error('Timezone is required.');
  if (!(settings.weekStartsOn === 0 || settings.weekStartsOn === 1)) throw new Error('Week start must be 0 or 1.');
  if (![0, 5, 10, 15].includes(Number(settings.roundingMinutes))) {
    throw new Error('Rounding must be 0, 5, 10, or 15 minutes.');
  }
  const autoLock = Number(settings.vaultAutoLockMinutes ?? 15);
  if (!Number.isFinite(autoLock) || autoLock < 1 || autoLock > 240) {
    throw new Error('Vault auto-lock must be between 1 and 240 minutes.');
  }
}

export function validateBackupData(data) {
  if (!isObject(data)) throw new Error('Backup data object is invalid.');
  if (!Array.isArray(data.projects)) throw new Error('Backup projects list is invalid.');
  if (!Array.isArray(data.entries)) throw new Error('Backup entries list is invalid.');
  if (!Array.isArray(data.settings)) throw new Error('Backup settings list is invalid.');

  data.projects.forEach(validateProject);
  data.entries.forEach(validateEntry);
  data.settings.forEach(validateSettings);

  if (data.timer !== null && data.timer !== undefined) {
    validateTimerSnapshot(data.timer);
  }
}
