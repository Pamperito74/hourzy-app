import { putOne } from './db.js';
import { getState, setState } from './state.js';
import { validateSettings } from './validation.js';

const ROUNDING_VALUES = new Set([0, 5, 10, 15]);

export async function updateSettings(patch) {
  const state = getState();
  const next = {
    ...state.settings,
    ...patch
  };

  if (!ROUNDING_VALUES.has(Number(next.roundingMinutes))) {
    throw new Error('Rounding must be 0, 5, 10, or 15 minutes.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: next.timezone }).format(new Date());
  } catch {
    throw new Error('Timezone must be a valid IANA name (e.g. America/New_York).');
  }

  next.weekStartsOn = Number(next.weekStartsOn) === 0 ? 0 : 1;
  next.roundingMinutes = Number(next.roundingMinutes);
  next.vaultAutoLockMinutes = Math.max(1, Math.min(240, Number(next.vaultAutoLockMinutes ?? 15)));

  validateSettings(next);
  await putOne('settings', next);
  setState((draft) => {
    draft.settings = next;
  });
}
