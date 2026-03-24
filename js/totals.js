import { localDateParts } from './security.js';

const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const tzOffsetFormatCache = new Map();

function getOffsetFormatter(timeZone) {
  const key = `offset:${timeZone}`;
  if (!tzOffsetFormatCache.has(key)) {
    tzOffsetFormatCache.set(
      key,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset'
      })
    );
  }
  return tzOffsetFormatCache.get(key);
}

function zonedOffsetMs(atUtcMs, timeZone) {
  const offsetPart = getOffsetFormatter(timeZone)
    .formatToParts(new Date(atUtcMs))
    .find((part) => part.type === 'timeZoneName')?.value;

  const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offsetPart || '');
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60000;
}

function zonedDateTimeToUtcMs(year, month, day, hour, minute, second, timeZone) {
  let utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const offset = zonedOffsetMs(utcGuess, timeZone);
    utcGuess = Date.UTC(year, month - 1, day, hour, minute, second) - offset;
  }
  return utcGuess;
}

function nextLocalMidnightUtcMs(ms, timeZone) {
  const p = localDateParts(ms, timeZone);
  const nextUtcDate = new Date(Date.UTC(p.year, p.month - 1, p.day) + 86400000);
  const nextYear = nextUtcDate.getUTCFullYear();
  const nextMonth = nextUtcDate.getUTCMonth() + 1;
  const nextDay = nextUtcDate.getUTCDate();
  const midnightUtc = zonedDateTimeToUtcMs(nextYear, nextMonth, nextDay, 0, 0, 0, timeZone);
  if (midnightUtc <= ms) return ms + 3600000;
  return midnightUtc;
}

function weekdayIndex(ms, timeZone) {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(ms));
  return WEEKDAY_MAP[short] ?? 0;
}

export function dateKey(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(ms));
}

function weekStartKey(ms, timeZone, weekStartsOn) {
  const dayIdx = weekdayIndex(ms, timeZone);
  const offset = (dayIdx - weekStartsOn + 7) % 7;
  const d = localDateParts(ms, timeZone);
  const base = new Date(Date.UTC(d.year, d.month - 1, d.day));
  base.setUTCDate(base.getUTCDate() - offset);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const day = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKey(ms, timeZone) {
  const parts = localDateParts(ms, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

export function sumDurationMs(entries) {
  return entries.reduce((acc, cur) => acc + Math.max(0, cur.durationMs || 0), 0);
}

export function splitDurationsByBucket(entries, settings) {
  const tz = settings.timezone;
  const weekStartsOn = settings.weekStartsOn;

  const day = new Map();
  const week = new Map();
  const month = new Map();

  for (const entry of entries) {
    let segmentStart = Number(entry.startUtcMs);
    const entryEnd = Number(entry.endUtcMs);

    if (!Number.isFinite(segmentStart) || !Number.isFinite(entryEnd) || entryEnd <= segmentStart) {
      continue;
    }

    while (segmentStart < entryEnd) {
      const segmentBoundary = nextLocalMidnightUtcMs(segmentStart, tz);
      const segmentEnd = Math.min(entryEnd, segmentBoundary);
      const segmentDuration = Math.max(0, segmentEnd - segmentStart);

      const dKey = dateKey(segmentStart, tz);
      const wKey = weekStartKey(segmentStart, tz, weekStartsOn);
      const mKey = monthKey(segmentStart, tz);

      day.set(dKey, (day.get(dKey) || 0) + segmentDuration);
      week.set(wKey, (week.get(wKey) || 0) + segmentDuration);
      month.set(mKey, (month.get(mKey) || 0) + segmentDuration);

      segmentStart = segmentEnd;
    }
  }

  return { day, week, month };
}

export function splitDurationsByProject(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = entry.projectId || null;
    map.set(key, (map.get(key) || 0) + Math.max(0, entry.durationMs || 0));
  }
  return map;
}

export function currentWeekKey(settings) {
  return weekStartKey(Date.now(), settings.timezone, settings.weekStartsOn);
}

export function currentMonthKey(settings) {
  return monthKey(Date.now(), settings.timezone);
}

export const __totalsInternals = {
  zonedDateTimeToUtcMs,
  nextLocalMidnightUtcMs
};

export function todayEntries(entries, settings) {
  const today = dateKey(Date.now(), settings.timezone);
  return entries.filter((entry) => dateKey(entry.startUtcMs, settings.timezone) === today);
}
