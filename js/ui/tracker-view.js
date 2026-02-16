import { createManualEntry, deleteEntry, updateEntry } from '../entries.js';
import { notify } from '../notify.js';
import { getState } from '../state.js';
import { formatDuration, formatHours } from '../security.js';
import { dateKey, splitDurationsByBucket, todayEntries } from '../totals.js';
import { discardTimer, startTimer, stopTimer, updateTimerDraft } from '../timer.js';
import { confirmDialog, editEntryDialog } from './dialogs.js';

function toLocalInput(ms) {
  const d = new Date(ms);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function projectOptions(projects) {
  const frag = document.createDocumentFragment();
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'Unassigned';
  frag.append(opt);
  for (const project of projects) {
    if (project.archived) continue;
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.name;
    frag.append(opt);
  }
  return frag;
}

export function renderTrackerView(root) {
  const state = getState();
  const today = todayEntries(state.entries, state.settings);
  const buckets = splitDurationsByBucket(state.entries, state.settings);
  const totalTodayMs = buckets.day.get(dateKey(Date.now(), state.settings.timezone)) || 0;

  const wrap = document.createElement('div');
  wrap.className = 'grid two';

  const timerCard = document.createElement('section');
  timerCard.className = 'card';
  timerCard.setAttribute('aria-labelledby', 'active-timer-title');

  const title = document.createElement('h2');
  title.id = 'active-timer-title';
  title.textContent = 'Active Timer';
  timerCard.append(title);

  const timerDisplay = document.createElement('div');
  timerDisplay.className = 'timer-display';
  timerDisplay.setAttribute('aria-live', 'polite');
  timerDisplay.textContent = formatDuration(state.timer.elapsedMs);
  timerCard.append(timerDisplay);

  const timerMeta = document.createElement('p');
  timerMeta.className = 'muted';
  timerMeta.textContent = state.timer.isRunning ? `Started ${new Date(state.timer.startUtcMs).toLocaleString()}` : 'Timer is stopped';
  timerCard.append(timerMeta);

  const projectField = document.createElement('div');
  projectField.className = 'field';
  const projectLabel = document.createElement('label');
  projectLabel.htmlFor = 'timerProject';
  projectLabel.textContent = 'Project';
  const projectSelect = document.createElement('select');
  projectSelect.id = 'timerProject';
  projectSelect.append(projectOptions(state.projects));
  projectSelect.value = state.timer.projectId || '';
  projectField.append(projectLabel, projectSelect);

  const noteField = document.createElement('div');
  noteField.className = 'field';
  const noteLabel = document.createElement('label');
  noteLabel.htmlFor = 'timerNote';
  noteLabel.textContent = 'Note';
  const noteInput = document.createElement('input');
  noteInput.id = 'timerNote';
  noteInput.type = 'text';
  noteInput.maxLength = 400;
  noteInput.placeholder = 'What are you working on?';
  noteInput.value = state.timer.note || '';
  noteField.append(noteLabel, noteInput);

  const actions = document.createElement('div');
  actions.className = 'row';
  const startStop = document.createElement('button');
  startStop.className = 'primary';
  startStop.textContent = state.timer.isRunning ? 'Stop' : 'Start';

  const discardBtn = document.createElement('button');
  discardBtn.textContent = 'Discard';
  discardBtn.disabled = !state.timer.isRunning;

  actions.append(startStop, discardBtn);

  timerCard.append(projectField, noteField, actions);

  const todayCard = document.createElement('section');
  todayCard.className = 'card';

  const todayTitle = document.createElement('h2');
  todayTitle.textContent = 'Today';

  const todayStat = document.createElement('p');
  todayStat.className = 'stat';
  todayStat.textContent = `${formatHours(totalTodayMs)} h`;

  const todayNote = document.createElement('p');
  todayNote.className = 'muted';
  todayNote.textContent = `${today.length} entries`;

  const list = document.createElement('div');
  list.className = 'list';

  if (!today.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No entries yet today.';
    list.append(empty);
  }

  const projectMap = new Map(state.projects.map((p) => [p.id, p.name]));
  for (const entry of today) {
    const item = document.createElement('article');
    item.className = 'list-item';

    const main = document.createElement('div');
    main.className = 'list-main';
    const p1 = document.createElement('p');
    p1.textContent = `${new Date(entry.startUtcMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(entry.endUtcMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const p2 = document.createElement('p');
    p2.className = 'muted';
    p2.textContent = `${projectMap.get(entry.projectId) || 'Unassigned'} | ${formatHours(entry.durationMs)} h`;
    const p3 = document.createElement('p');
    p3.className = 'muted';
    p3.textContent = entry.note || '(No note)';
    main.append(p1, p2, p3);

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'list-actions';

    const editBtn = document.createElement('button');
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
        notify(error.message || 'Failed to update entry.', 'error');
      }
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const confirmed = await confirmDialog({
        title: 'Delete Entry',
        message: 'Delete this entry permanently?',
        confirmText: 'Delete',
        danger: true
      });
      if (!confirmed) return;
      await deleteEntry(entry.id);
    });

    actionsWrap.append(editBtn, delBtn);
    item.append(main, actionsWrap);
    list.append(item);
  }

  todayCard.append(todayTitle, todayStat, todayNote, list);

  const manualCard = document.createElement('section');
  manualCard.className = 'card';

  const manualTitle = document.createElement('h2');
  manualTitle.textContent = 'Manual Entry';

  const form = document.createElement('form');
  form.className = 'grid';

  const manualProjectField = document.createElement('div');
  manualProjectField.className = 'field';
  const mpl = document.createElement('label');
  mpl.htmlFor = 'manualProject';
  mpl.textContent = 'Project';
  const mps = document.createElement('select');
  mps.id = 'manualProject';
  mps.append(projectOptions(state.projects));
  manualProjectField.append(mpl, mps);

  const startField = document.createElement('div');
  startField.className = 'field';
  const sl = document.createElement('label');
  sl.htmlFor = 'manualStart';
  sl.textContent = 'Start';
  const startInput = document.createElement('input');
  startInput.id = 'manualStart';
  startInput.type = 'datetime-local';
  startInput.required = true;

  const endField = document.createElement('div');
  endField.className = 'field';
  const el = document.createElement('label');
  el.htmlFor = 'manualEnd';
  el.textContent = 'End';
  const endInput = document.createElement('input');
  endInput.id = 'manualEnd';
  endInput.type = 'datetime-local';
  endInput.required = true;

  const initialEnd = new Date();
  const initialStart = new Date(Date.now() - 3600_000);
  startInput.value = toLocalInput(initialStart.getTime());
  endInput.value = toLocalInput(initialEnd.getTime());

  startField.append(sl, startInput);
  endField.append(el, endInput);

  const manualNoteField = document.createElement('div');
  manualNoteField.className = 'field';
  const mnl = document.createElement('label');
  mnl.htmlFor = 'manualNote';
  mnl.textContent = 'Note';
  const mni = document.createElement('input');
  mni.id = 'manualNote';
  mni.maxLength = 400;
  manualNoteField.append(mnl, mni);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'primary';
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Add Entry';

  form.append(manualProjectField, startField, endField, manualNoteField, saveBtn);
  manualCard.append(manualTitle, form);

  wrap.append(timerCard, todayCard, manualCard);

  projectSelect.addEventListener('change', async () => {
    await updateTimerDraft({ projectId: projectSelect.value || null });
  });

  noteInput.addEventListener('input', async () => {
    await updateTimerDraft({ note: noteInput.value });
  });

  startStop.addEventListener('click', async () => {
    try {
      if (getState().timer.isRunning) {
        await stopTimer();
      } else {
        await startTimer({ projectId: projectSelect.value || null, note: noteInput.value });
      }
    } catch (error) {
      notify(error.message || 'Timer action failed.', 'error');
    }
  });

  discardBtn.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Discard Timer',
      message: 'Discard the running timer without creating an entry?',
      confirmText: 'Discard',
      danger: true
    });
    if (!confirmed) return;
    await discardTimer();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await createManualEntry({
        projectId: mps.value || null,
        note: mni.value,
        startIsoLocal: startInput.value,
        endIsoLocal: endInput.value
      });
      mni.value = '';
    } catch (error) {
      notify(error.message || 'Could not save manual entry.', 'error');
    }
  });

  root.append(wrap);
}
