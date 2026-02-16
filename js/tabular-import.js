import { getAll, putOne } from './db.js';
import { downloadBlob, sanitizeText } from './security.js';
import { validateEntry, validateProject } from './validation.js';

const FIELD_KEYS = {
  start: ['start', 'start_utc', 'start time', 'started_at', 'startutcms', 'start_utc_ms'],
  end: ['end', 'end_utc', 'end time', 'ended_at', 'endutcms', 'end_utc_ms'],
  duration: ['duration_hours', 'duration', 'hours', 'duration_h'],
  project: ['project', 'project_name', 'client', 'client_name'],
  note: [
    'note',
    'description',
    'task',
    'details',
    'task description notes',
    'task description completed',
    'task description in progress'
  ],
  day: ['day', 'weekday'],
  source: ['source', 'entry_type', 'type']
};

const DAY_MS = 86400000;
const DEFAULT_IMPORT_START_HOUR = 9;
const WEEKDAY_INDEX = new Map([
  ['sunday', 0],
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6]
]);
const MONTH_INDEX = new Map([
  ['jan', 0], ['january', 0],
  ['feb', 1], ['february', 1],
  ['mar', 2], ['march', 2],
  ['apr', 3], ['april', 3],
  ['may', 4],
  ['jun', 5], ['june', 5],
  ['jul', 6], ['july', 6],
  ['aug', 7], ['august', 7],
  ['sep', 8], ['sept', 8], ['september', 8],
  ['oct', 9], ['october', 9],
  ['nov', 10], ['november', 10],
  ['dec', 11], ['december', 11]
]);

function normalizeKey(key) {
  return String(key || '').trim().toLowerCase();
}

function normalizeRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[normalizeKey(k)] = v;
  }
  return out;
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return null;
}

function parseDateMs(value) {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();

  if (typeof value === 'number') {
    if (value > 1_000_000_000_000) return value;
    if (value > 1_000_000_000) return value * 1000;
    const excelEpoch = Date.UTC(1899, 11, 30);
    return excelEpoch + Math.round(value * 86400000);
  }

  const text = String(value).trim();
  if (!text) return NaN;

  const asNum = Number(text);
  if (Number.isFinite(asNum) && text.length <= 8) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return excelEpoch + Math.round(asNum * 86400000);
  }

  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function parseCsvRows(text) {
  const { parse } = await import('papaparse');
  const parsed = parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true
  });

  if (parsed.errors?.length) {
    const first = parsed.errors[0];
    throw new Error(`CSV parse error at row ${first.row ?? '?'}: ${first.message}`);
  }

  return parsed.data || [];
}

async function parseExcelRows(buffer) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  if (!wb.SheetNames?.length) return [];

  let inferredYear = null;
  let prevMonthIndex = null;
  const rows = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const parsedRows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true, cellDates: true });
    const lowerSheet = normalizeKey(sheetName);
    const isTotalSheet = lowerSheet === 'total' || lowerSheet.startsWith('total ');
    if (!parsedRows.length || isTotalSheet) continue;

    const anchor = parseSheetAnchor(sheetName);
    if (anchor) {
      if (inferredYear == null) {
        inferredYear = inferInitialYear(anchor.monthIndex);
      } else if (prevMonthIndex != null && anchor.monthIndex < prevMonthIndex) {
        inferredYear += 1;
      }
      prevMonthIndex = anchor.monthIndex;
    }

    for (const row of parsedRows) {
      rows.push({
        ...row,
        __sheetName: sheetName,
        __sheetMonthIndex: anchor?.monthIndex ?? null,
        __sheetDayOfMonth: anchor?.dayOfMonth ?? null,
        __sheetYear: anchor ? inferredYear : null
      });
    }
  }

  return rows;
}

function entryDedupeKey(entry) {
  return [entry.projectId || '', entry.startUtcMs, entry.endUtcMs, entry.note || ''].join('|');
}

function normalizeSource(value) {
  const lower = String(value || '').toLowerCase();
  return lower === 'timer' ? 'timer' : 'manual';
}

function extractHeaders(rawRows) {
  const headers = new Set();
  for (const row of rawRows) {
    for (const key of Object.keys(row || {})) {
      if (String(key || '').trim() && !String(key).startsWith('__')) headers.add(String(key));
    }
  }
  return Array.from(headers);
}

function parseSheetAnchor(sheetName) {
  const text = String(sheetName || '').trim();
  if (!text) return null;
  const monthMatch = text.match(/\b([A-Za-z]{3,9})\b/);
  if (!monthMatch) return null;
  const monthIndex = MONTH_INDEX.get(normalizeKey(monthMatch[1]));
  if (monthIndex == null) return null;
  const dayMatch = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/i);
  const dayOfMonth = dayMatch ? Number(dayMatch[1]) : null;
  if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return null;
  return { monthIndex, dayOfMonth };
}

function inferInitialYear(firstMonthIndex) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  if (firstMonthIndex - currentMonth > 2) return currentYear - 1;
  return currentYear;
}

function inferMapping(headers) {
  const normalizedHeaderMap = new Map(headers.map((h) => [normalizeKey(h), h]));
  const mapping = {};
  for (const [field, aliases] of Object.entries(FIELD_KEYS)) {
    const normalizedHit = aliases.find((alias) => normalizedHeaderMap.has(alias));
    mapping[field] = normalizedHit ? normalizedHeaderMap.get(normalizedHit) : '';
  }
  return mapping;
}

function valueFromRow(rawRow, normalizedRow, mapping, field) {
  const mappedHeader = mapping?.[field];
  if (mappedHeader) {
    return rawRow[mappedHeader];
  }
  return pick(normalizedRow, FIELD_KEYS[field]);
}

function rowHasContent(rawRow) {
  for (const [key, value] of Object.entries(rawRow || {})) {
    if (String(key).startsWith('__')) continue;
    if (value != null && String(value).trim() !== '') return true;
  }
  return false;
}

function parseWeekday(value) {
  const text = normalizeKey(value).replace(/\s+/g, ' ');
  if (!text) return null;
  let previous = false;
  let name = text;
  if (name.startsWith('previous ')) {
    previous = true;
    name = name.slice('previous '.length);
  }
  let index = WEEKDAY_INDEX.get(name);
  if (index == null) {
    for (const [weekday, weekdayIndex] of WEEKDAY_INDEX.entries()) {
      if (name.includes(weekday)) {
        index = weekdayIndex;
        break;
      }
      if (name.startsWith(weekday.slice(0, 3))) {
        index = weekdayIndex;
        break;
      }
    }
  }
  if (index == null) return null;
  return { index, previous };
}

function deriveDateFromSheetDay(rawRow, dayValue) {
  const year = Number(rawRow.__sheetYear);
  const monthIndex = Number(rawRow.__sheetMonthIndex);
  const dayOfMonth = Number(rawRow.__sheetDayOfMonth);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(dayOfMonth)) {
    return NaN;
  }

  const weekday = parseWeekday(dayValue);
  if (!weekday) return NaN;

  const anchor = new Date(year, monthIndex, dayOfMonth, DEFAULT_IMPORT_START_HOUR, 0, 0, 0).getTime();
  const anchorWeekday = new Date(anchor).getDay();
  const offsetDays = (weekday.index - anchorWeekday) + (weekday.previous ? -7 : 0);
  return anchor + (offsetDays * DAY_MS);
}

function extractRowNote(raw, row, mapping) {
  const direct = valueFromRow(raw, row, mapping, 'note');
  if (direct != null && String(direct).trim() !== '') return String(direct);

  const parts = [];
  for (const [key, value] of Object.entries(raw || {})) {
    if (String(key).startsWith('__')) continue;
    const normalized = normalizeKey(key);
    if (!normalized.startsWith('task description')) continue;
    const text = String(value || '').trim();
    if (text) parts.push(text);
  }
  return parts.join(' | ');
}

export async function analyzeTabularFile(file) {
  if (!file) throw new Error('No file selected.');

  const name = String(file.name || '').toLowerCase();
  let rawRows;

  if (name.endsWith('.csv')) {
    rawRows = await parseCsvRows(await file.text());
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    rawRows = await parseExcelRows(await file.arrayBuffer());
  } else {
    throw new Error('Unsupported file. Use .csv, .xlsx, or .xls');
  }

  const headers = extractHeaders(rawRows);
  const normalizedRows = rawRows.map((row) => normalizeRow(row));

  return {
    fileName: file.name,
    totalRows: rawRows.length,
    headers,
    rawRows,
    normalizedRows,
    inferredMapping: inferMapping(headers),
    sampleRows: rawRows.slice(0, 5)
  };
}

export async function importTabularAnalysis(analysis, { mapping } = {}) {
  if (!analysis) throw new Error('Import analysis is missing.');

  const [existingProjects, existingEntries] = await Promise.all([
    getAll('projects'),
    getAll('entries')
  ]);

  const projectByName = new Map(existingProjects.map((p) => [String(p.name).trim().toLowerCase(), p]));
  const entryKeys = new Set(existingEntries.map(entryDedupeKey));

  let created = 0;
  let skipped = 0;
  let invalid = 0;
  let createdProjects = 0;
  let minStartUtcMs = Number.POSITIVE_INFINITY;
  let maxEndUtcMs = Number.NEGATIVE_INFINITY;

  const resolvedMapping = mapping || analysis.inferredMapping || {};

  for (let i = 0; i < analysis.rawRows.length; i += 1) {
    const raw = analysis.rawRows[i];
    const row = analysis.normalizedRows[i];
    if (!rowHasContent(raw)) {
      skipped += 1;
      continue;
    }

    const startValue = valueFromRow(raw, row, resolvedMapping, 'start');
    const endValue = valueFromRow(raw, row, resolvedMapping, 'end');
    const durationValue = valueFromRow(raw, row, resolvedMapping, 'duration');
    const dayValue = valueFromRow(raw, row, resolvedMapping, 'day');

    let startUtcMs = parseDateMs(startValue);
    let endUtcMs = parseDateMs(endValue);
    if (!Number.isFinite(startUtcMs) && dayValue != null && String(dayValue).trim() !== '') {
      startUtcMs = deriveDateFromSheetDay(raw, dayValue);
    }

    if (!Number.isFinite(startUtcMs)) {
      skipped += 1;
      continue;
    }

    if (!Number.isFinite(endUtcMs)) {
      const hours = Number(durationValue);
      if (!Number.isFinite(hours) || hours <= 0) {
        skipped += 1;
        continue;
      }
      endUtcMs = startUtcMs + Math.round(hours * 3600000);
    }

    if (!(endUtcMs > startUtcMs)) {
      invalid += 1;
      continue;
    }

    const projectRaw = sanitizeText(String(valueFromRow(raw, row, resolvedMapping, 'project') || ''), 80);
    let projectId = null;
    if (projectRaw) {
      const key = projectRaw.toLowerCase();
      let project = projectByName.get(key);
      if (!project) {
        const now = Date.now();
        project = {
          id: crypto.randomUUID(),
          name: projectRaw,
          hourlyRate: null,
          archived: false,
          createdAtMs: now,
          updatedAtMs: now
        };
        validateProject(project);
        await putOne('projects', project);
        projectByName.set(key, project);
        createdProjects += 1;
      }
      projectId = project.id;
    }

    const note = sanitizeText(extractRowNote(raw, row, resolvedMapping), 400);
    const source = normalizeSource(valueFromRow(raw, row, resolvedMapping, 'source'));
    const now = Date.now();

    const entry = {
      id: crypto.randomUUID(),
      projectId,
      note,
      startUtcMs,
      endUtcMs,
      durationMs: endUtcMs - startUtcMs,
      source,
      createdAtMs: now,
      updatedAtMs: now
    };

    validateEntry(entry);

    const dedupe = entryDedupeKey(entry);
    if (entryKeys.has(dedupe)) {
      skipped += 1;
      continue;
    }

    await putOne('entries', entry);
    entryKeys.add(dedupe);
    created += 1;
    minStartUtcMs = Math.min(minStartUtcMs, startUtcMs);
    maxEndUtcMs = Math.max(maxEndUtcMs, endUtcMs);
  }

  return {
    totalRows: analysis.totalRows,
    created,
    skipped,
    invalid,
    createdProjects,
    minStartUtcMs: Number.isFinite(minStartUtcMs) ? minStartUtcMs : null,
    maxEndUtcMs: Number.isFinite(maxEndUtcMs) ? maxEndUtcMs : null
  };
}

export async function importTabularFile(file, options = {}) {
  const analysis = await analyzeTabularFile(file);
  return importTabularAnalysis(analysis, options);
}

export function downloadCsvTemplate() {
  const csv = [
    'project,note,start,end,duration_hours,source',
    'Client A,Design review,2026-02-16T09:00:00-05:00,2026-02-16T10:30:00-05:00,1.5,manual',
    'Client B,Implementation,2026-02-16T11:00:00-05:00,2026-02-16T13:15:00-05:00,2.25,timer'
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob('hourzy-import-template.csv', blob);
}
