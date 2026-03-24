import { filterEntries } from '../export.js';
import { getState, setState } from '../state.js';
import { formatHours } from '../security.js';
import {
  splitDurationsByBucket,
  splitDurationsByProject,
  currentWeekKey,
  currentMonthKey
} from '../totals.js';

export function renderReportsView(root) {
  const state = getState();

  const pageHeader = document.createElement('div');
  const pageTitle = document.createElement('h1');
  pageTitle.className = 'page-title';
  pageTitle.textContent = 'Reports';
  const pageSubtitle = document.createElement('p');
  pageSubtitle.className = 'page-subtitle';
  pageSubtitle.textContent = 'Visualize your time across projects and periods.';
  pageHeader.append(pageTitle, pageSubtitle);
  root.append(pageHeader);

  // Filter bar — inline toolbar, no card wrapper
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  const fromField = document.createElement('div');
  fromField.className = 'field';
  const fromLabel = document.createElement('label');
  fromLabel.htmlFor = 'rpFrom';
  fromLabel.textContent = 'From';
  const fromInput = document.createElement('input');
  fromInput.id = 'rpFrom';
  fromInput.type = 'date';
  fromInput.value = state.ui.filters.from || '';
  fromField.append(fromLabel, fromInput);

  const toField = document.createElement('div');
  toField.className = 'field';
  const toLabel = document.createElement('label');
  toLabel.htmlFor = 'rpTo';
  toLabel.textContent = 'To';
  const toInput = document.createElement('input');
  toInput.id = 'rpTo';
  toInput.type = 'date';
  toInput.value = state.ui.filters.to || '';
  toField.append(toLabel, toInput);

  const pField = document.createElement('div');
  pField.className = 'field';
  const pLabel = document.createElement('label');
  pLabel.htmlFor = 'rpProject';
  pLabel.textContent = 'Project';
  const pSelect = document.createElement('select');
  pSelect.id = 'rpProject';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All projects';
  pSelect.append(allOpt);
  for (const project of state.projects) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.name;
    pSelect.append(opt);
  }
  pSelect.value = state.ui.filters.projectId || 'all';
  pField.append(pLabel, pSelect);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear filters';

  filterBar.append(fromField, toField, pField, clearBtn);
  root.append(filterBar);

  // Bind filter events
  function syncFilters() {
    setState((draft) => {
      draft.ui.filters.from = fromInput.value;
      draft.ui.filters.to = toInput.value;
      draft.ui.filters.projectId = pSelect.value;
    });
  }
  fromInput.addEventListener('change', syncFilters);
  toInput.addEventListener('change', syncFilters);
  pSelect.addEventListener('change', syncFilters);
  clearBtn.addEventListener('click', () => {
    fromInput.value = '';
    toInput.value = '';
    pSelect.value = 'all';
    syncFilters();
  });

  // Filtered data
  const filtered = filterEntries(state.entries, {
    from: state.ui.filters.from,
    to: state.ui.filters.to,
    projectId: state.ui.filters.projectId,
    timeZone: state.settings.timezone
  });

  // Summary stats (week/month use all entries; selected period uses filtered)
  const allBuckets = splitDurationsByBucket(state.entries, state.settings);
  const wKey = currentWeekKey(state.settings);
  const mKey = currentMonthKey(state.settings);
  const thisWeekMs = allBuckets.week.get(wKey) || 0;
  const thisMonthMs = allBuckets.month.get(mKey) || 0;
  const selectedMs = filtered.reduce((acc, cur) => acc + cur.durationMs, 0);

  const statsRow = document.createElement('div');
  statsRow.className = 'stat-row';

  function makeStatItem(label, ms, sub) {
    const item = document.createElement('div');
    item.className = 'stat-row-item';
    const h = document.createElement('h3');
    h.textContent = label;
    const s = document.createElement('p');
    s.className = 'stat';
    s.textContent = `${formatHours(ms)} h`;
    item.append(h, s);
    if (sub) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = sub;
      item.append(p);
    }
    return item;
  }

  statsRow.append(
    makeStatItem('This week', thisWeekMs),
    makeStatItem('This month', thisMonthMs),
    makeStatItem('Selected period', selectedMs, `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`)
  );
  root.append(statsRow);

  // Empty state
  if (!filtered.length) {
    const empty = document.createElement('section');
    empty.className = 'card reports-empty';

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '40');
    icon.setAttribute('height', '40');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.5');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>';

    const msg = document.createElement('p');
    msg.className = 'muted';
    msg.textContent = 'No entries match the selected filters. Log some time or adjust the date range.';
    empty.append(icon, msg);
    root.append(empty);
    return;
  }

  // Project breakdown
  const projectMap = new Map(state.projects.map((p) => [p.id, p.name]));
  const byProject = splitDurationsByProject(filtered);
  const sortedProjects = [...byProject.entries()].sort((a, b) => b[1] - a[1]);
  const maxProjectMs = sortedProjects[0]?.[1] || 1;

  const breakdownCard = document.createElement('section');
  breakdownCard.className = 'card';
  const breakdownTitle = document.createElement('h3');
  breakdownTitle.textContent = 'Project breakdown';
  breakdownCard.append(breakdownTitle);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-wrap';

  for (const [projectId, ms] of sortedProjects) {
    const name = projectId ? (projectMap.get(projectId) || 'Unknown') : 'Unassigned';
    const pct = (ms / maxProjectMs) * 100;

    const row = document.createElement('div');
    row.className = 'chart-row';

    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = name;
    label.title = name;

    const barWrap = document.createElement('div');
    barWrap.className = 'chart-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.width = `${pct}%`;
    barWrap.append(bar);

    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = `${formatHours(ms)} h`;

    row.append(label, barWrap, value);
    chartWrap.append(row);
  }

  breakdownCard.append(chartWrap);
  root.append(breakdownCard);

  // Daily trend (last 30 days with data from the filtered set)
  const filteredBuckets = splitDurationsByBucket(filtered, state.settings);
  const dayMap = filteredBuckets.day;
  const dayKeys = [...dayMap.keys()].sort().slice(-30);

  if (dayKeys.length > 0) {
    const maxDayMs = Math.max(...dayKeys.map((k) => dayMap.get(k) || 0)) || 1;

    const trendCard = document.createElement('section');
    trendCard.className = 'card';
    const trendTitle = document.createElement('h3');
    trendTitle.textContent = 'Daily trend';
    trendCard.append(trendTitle);

    const trendChart = document.createElement('div');
    trendChart.className = 'trend-chart';
    trendChart.setAttribute('aria-hidden', 'true');

    for (const dk of dayKeys) {
      const ms = dayMap.get(dk) || 0;
      const heightPct = Math.max((ms / maxDayMs) * 100, 2);

      const col = document.createElement('div');
      col.className = 'trend-col';
      col.title = `${dk}: ${formatHours(ms)} h`;

      const bar = document.createElement('div');
      bar.className = 'trend-bar';
      bar.style.height = `${heightPct}%`;

      const axisLabel = document.createElement('span');
      axisLabel.className = 'trend-label';
      axisLabel.textContent = dk.slice(-2).replace(/^0/, '');

      col.append(bar, axisLabel);
      trendChart.append(col);
    }

    trendCard.append(trendChart);
    root.append(trendCard);
  }
}
