import { deleteEntry, updateEntry } from '../entries.js';
import { filterEntries } from '../export.js';
import { notify } from '../notify.js';
import { getState, setState } from '../state.js';
import { formatHours } from '../security.js';
import { confirmDialog, editEntryDialog } from './dialogs.js';

function projectOptions(projects) {
  const frag = document.createDocumentFragment();
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'Unassigned';
  frag.append(opt);
  for (const project of projects) {
    const p = document.createElement('option');
    p.value = project.id;
    p.textContent = project.name;
    frag.append(p);
  }
  return frag;
}

export function renderEntriesView(root) {
  const state = getState();

  const card = document.createElement('section');
  card.className = 'card';

  const title = document.createElement('h2');
  title.textContent = 'Entries';

  const filters = document.createElement('div');
  filters.className = 'grid two';

  const fromField = document.createElement('div');
  fromField.className = 'field';
  const fromLabel = document.createElement('label');
  fromLabel.htmlFor = 'fFrom';
  fromLabel.textContent = 'From';
  const fromInput = document.createElement('input');
  fromInput.id = 'fFrom';
  fromInput.type = 'date';
  fromInput.value = state.ui.filters.from || '';
  fromField.append(fromLabel, fromInput);

  const toField = document.createElement('div');
  toField.className = 'field';
  const toLabel = document.createElement('label');
  toLabel.htmlFor = 'fTo';
  toLabel.textContent = 'To';
  const toInput = document.createElement('input');
  toInput.id = 'fTo';
  toInput.type = 'date';
  toInput.value = state.ui.filters.to || '';
  toField.append(toLabel, toInput);

  const pField = document.createElement('div');
  pField.className = 'field';
  const pLabel = document.createElement('label');
  pLabel.htmlFor = 'fProject';
  pLabel.textContent = 'Project';
  const pSelect = document.createElement('select');
  pSelect.id = 'fProject';
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
  clearBtn.textContent = 'Clear Filters';

  filters.append(fromField, toField, pField, clearBtn);

  const rows = filterEntries(state.entries, {
    from: state.ui.filters.from,
    to: state.ui.filters.to,
    projectId: state.ui.filters.projectId,
    timeZone: state.settings.timezone
  });

  const summary = document.createElement('p');
  summary.className = 'muted';
  summary.textContent = `${rows.length} entries | ${formatHours(rows.reduce((acc, cur) => acc + cur.durationMs, 0))} h`;

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';
  const table = document.createElement('table');

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['Start', 'End', 'Duration', 'Project', 'Note', 'Source', 'Actions'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    trh.append(th);
  });
  thead.append(trh);

  const tbody = document.createElement('tbody');
  const projectMap = new Map(state.projects.map((p) => [p.id, p.name]));

  for (const entry of rows) {
    const tr = document.createElement('tr');

    const startTd = document.createElement('td');
    startTd.textContent = new Date(entry.startUtcMs).toLocaleString();

    const endTd = document.createElement('td');
    endTd.textContent = new Date(entry.endUtcMs).toLocaleString();

    const durTd = document.createElement('td');
    durTd.textContent = `${formatHours(entry.durationMs)} h`;

    const projectTd = document.createElement('td');
    projectTd.textContent = projectMap.get(entry.projectId) || 'Unassigned';

    const noteTd = document.createElement('td');
    noteTd.textContent = entry.note || '';

    const sourceTd = document.createElement('td');
    sourceTd.textContent = entry.source;

    const actionTd = document.createElement('td');
    const rowActions = document.createElement('div');
    rowActions.className = 'row';

    const editBtn = document.createElement('button');
    editBtn.className = 'sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', async () => {
      const patch = await editEntryDialog({
        entry,
        projectOptions: () => projectOptions(state.projects)
      });
      if (!patch) return;
      try {
        await updateEntry(entry.id, patch);
      } catch (error) {
        notify(error.message || 'Update failed.', 'error');
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger sm';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Delete Entry',
        message: 'Delete this entry permanently?',
        confirmText: 'Delete',
        danger: true
      });
      if (!confirmed) return;
      await deleteEntry(entry.id);
    });

    rowActions.append(editBtn, deleteBtn);
    actionTd.append(rowActions);

    tr.append(startTd, endTd, durTd, projectTd, noteTd, sourceTd, actionTd);
    tbody.append(tr);
  }

  table.append(thead, tbody);
  tableWrap.append(table);
  card.append(title, filters, summary, tableWrap);
  root.append(card);

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
}
