function attachDialog(dialog) {
  document.body.append(dialog);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', 'open');
  }
}

function cleanupDialog(dialog) {
  dialog.remove();
}

function trapFocus(dialog, event) {
  if (event.key !== 'Tab') return;
  const focusables = dialog.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openModal(dialog, initialFocusEl) {
  const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.addEventListener('keydown', (event) => trapFocus(dialog, event));
  attachDialog(dialog);
  initialFocusEl?.focus();
  return () => {
    cleanupDialog(dialog);
    previousActive?.focus();
  };
}

export function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    const titleId = `modalTitle-${crypto.randomUUID()}`;
    const bodyId = `modalBody-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.setAttribute('aria-describedby', bodyId);

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'modal-content';

    const h = document.createElement('h3');
    h.id = titleId;
    h.textContent = title;
    const p = document.createElement('p');
    p.id = bodyId;
    p.className = 'muted';
    p.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'row';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.value = 'cancel';
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = danger ? 'danger' : 'primary';
    confirmBtn.value = 'confirm';
    confirmBtn.textContent = confirmText;

    actions.append(cancelBtn, confirmBtn);
    form.append(h, p, actions);
    dialog.append(form);
    const closeModal = openModal(dialog, confirmBtn);
    let resolved = false;

    dialog.addEventListener('close', () => {
      if (resolved) return;
      resolved = true;
      const ok = dialog.returnValue === 'confirm';
      closeModal();
      resolve(ok);
    });

    cancelBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(false);
    });

    dialog.addEventListener('cancel', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(false);
    });
  });
}

function toLocalInput(ms) {
  const d = new Date(ms);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function editEntryDialog({ entry, projectOptions }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    const titleId = `modalTitle-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', titleId);

    const form = document.createElement('form');
    form.className = 'modal-content grid';
    form.noValidate = true;

    const title = document.createElement('h3');
    title.id = titleId;
    title.textContent = 'Edit Entry';

    const projectField = document.createElement('div');
    projectField.className = 'field';
    const projectLabel = document.createElement('label');
    projectLabel.htmlFor = 'editEntryProject';
    projectLabel.textContent = 'Project';
    const projectSelect = document.createElement('select');
    projectSelect.id = 'editEntryProject';
    projectSelect.append(projectOptions());
    projectSelect.value = entry.projectId || '';
    projectField.append(projectLabel, projectSelect);

    const startField = document.createElement('div');
    startField.className = 'field';
    const startLabel = document.createElement('label');
    startLabel.htmlFor = 'editEntryStart';
    startLabel.textContent = 'Start';
    const startInput = document.createElement('input');
    startInput.id = 'editEntryStart';
    startInput.type = 'datetime-local';
    startInput.required = true;
    startInput.value = toLocalInput(entry.startUtcMs);
    startField.append(startLabel, startInput);

    const endField = document.createElement('div');
    endField.className = 'field';
    const endLabel = document.createElement('label');
    endLabel.htmlFor = 'editEntryEnd';
    endLabel.textContent = 'End';
    const endInput = document.createElement('input');
    endInput.id = 'editEntryEnd';
    endInput.type = 'datetime-local';
    endInput.required = true;
    endInput.value = toLocalInput(entry.endUtcMs);
    endField.append(endLabel, endInput);

    const noteField = document.createElement('div');
    noteField.className = 'field';
    const noteLabel = document.createElement('label');
    noteLabel.htmlFor = 'editEntryNote';
    noteLabel.textContent = 'Note';
    const noteInput = document.createElement('input');
    noteInput.id = 'editEntryNote';
    noteInput.maxLength = 400;
    noteInput.value = entry.note || '';
    noteField.append(noteLabel, noteInput);

    const actions = document.createElement('div');
    actions.className = 'row';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary';
    saveBtn.type = 'submit';
    saveBtn.textContent = 'Save';

    actions.append(cancelBtn, saveBtn);
    form.append(title, projectField, startField, endField, noteField, actions);
    dialog.append(form);
    const closeModal = openModal(dialog, startInput);
    let resolved = false;

    cancelBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(null);
    });

    dialog.addEventListener('cancel', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(null);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (resolved) return;
      resolved = true;
      resolve({
        projectId: projectSelect.value || null,
        startIsoLocal: startInput.value,
        endIsoLocal: endInput.value,
        note: noteInput.value
      });
      closeModal();
    });
  });
}

export function passphraseDialog({ title, message }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    const titleId = `modalTitle-${crypto.randomUUID()}`;
    const bodyId = `modalBody-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.setAttribute('aria-describedby', bodyId);

    const form = document.createElement('form');
    form.className = 'modal-content grid';

    const h = document.createElement('h3');
    h.id = titleId;
    h.textContent = title;
    const p = document.createElement('p');
    p.id = bodyId;
    p.className = 'muted';
    p.textContent = message;

    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.htmlFor = 'passphraseInput';
    label.textContent = 'Passphrase';
    const input = document.createElement('input');
    input.id = 'passphraseInput';
    input.type = 'password';
    input.required = true;
    input.minLength = 8;
    input.autocomplete = 'new-password';
    field.append(label, input);

    const actions = document.createElement('div');
    actions.className = 'row';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'primary';
    submitBtn.textContent = 'Continue';
    actions.append(cancelBtn, submitBtn);

    form.append(h, p, field, actions);
    dialog.append(form);
    const closeModal = openModal(dialog, input);
    let resolved = false;

    cancelBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(null);
    });

    dialog.addEventListener('cancel', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(null);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (resolved) return;
      resolved = true;
      const value = input.value;
      input.value = '';
      resolve(value);
      closeModal();
    });
  });
}

export function textInputDialog({ title, message, label = 'Value', placeholder = '', initialValue = '' }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    const titleId = `modalTitle-${crypto.randomUUID()}`;
    const bodyId = `modalBody-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.setAttribute('aria-describedby', bodyId);

    const form = document.createElement('form');
    form.className = 'modal-content grid';

    const h = document.createElement('h3');
    h.id = titleId;
    h.textContent = title;
    const p = document.createElement('p');
    p.id = bodyId;
    p.className = 'muted';
    p.textContent = message;

    const field = document.createElement('div');
    field.className = 'field';
    const fieldLabel = document.createElement('label');
    fieldLabel.htmlFor = 'textInputDialogValue';
    fieldLabel.textContent = label;
    const input = document.createElement('input');
    input.id = 'textInputDialogValue';
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = initialValue;
    field.append(fieldLabel, input);

    const actions = document.createElement('div');
    actions.className = 'row';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'primary';
    submitBtn.textContent = 'Continue';
    actions.append(cancelBtn, submitBtn);

    form.append(h, p, field, actions);
    dialog.append(form);
    const closeModal = openModal(dialog, input);
    let resolved = false;

    cancelBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(null);
    });

    dialog.addEventListener('cancel', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(null);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (resolved) return;
      resolved = true;
      const value = input.value;
      input.value = '';
      closeModal();
      resolve(value);
    });
  });
}

export function tabularMappingDialog({ analysis }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    const titleId = `modalTitle-${crypto.randomUUID()}`;
    dialog.setAttribute('aria-labelledby', titleId);

    const form = document.createElement('form');
    form.className = 'modal-content grid';

    const title = document.createElement('h3');
    title.id = titleId;
    title.textContent = 'CSV/Excel Mapping Preview';
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `${analysis.fileName} | ${analysis.totalRows} rows`;

    const fields = [
      ['start', 'Start'],
      ['end', 'End'],
      ['duration', 'Duration (hours)'],
      ['day', 'Day / Weekday'],
      ['project', 'Project'],
      ['note', 'Note'],
      ['source', 'Source']
    ];

    const selects = new Map();
    for (const [field, labelText] of fields) {
      const fieldWrap = document.createElement('div');
      fieldWrap.className = 'field';
      const label = document.createElement('label');
      label.htmlFor = `map-${field}`;
      label.textContent = labelText;
      const select = document.createElement('select');
      select.id = `map-${field}`;

      const auto = document.createElement('option');
      auto.value = '';
      auto.textContent = '(Auto detect)';
      select.append(auto);

      for (const header of analysis.headers) {
        const opt = document.createElement('option');
        opt.value = header;
        opt.textContent = header;
        select.append(opt);
      }

      if (analysis.inferredMapping?.[field]) {
        select.value = analysis.inferredMapping[field];
      }

      fieldWrap.append(label, select);
      form.append(fieldWrap);
      selects.set(field, select);
    }

    const sampleTitle = document.createElement('h4');
    sampleTitle.textContent = 'Sample Rows';
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const previewHeaders = analysis.headers.slice(0, 6);
    for (const h of previewHeaders) {
      const th = document.createElement('th');
      th.textContent = h;
      trh.append(th);
    }
    thead.append(trh);

    const tbody = document.createElement('tbody');
    for (const row of analysis.sampleRows || []) {
      const tr = document.createElement('tr');
      for (const h of previewHeaders) {
        const td = document.createElement('td');
        td.textContent = row[h] == null ? '' : String(row[h]);
        tr.append(td);
      }
      tbody.append(tr);
    }

    table.append(thead, tbody);
    tableWrap.append(table);

    const actions = document.createElement('div');
    actions.className = 'row';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    const proceedBtn = document.createElement('button');
    proceedBtn.type = 'submit';
    proceedBtn.className = 'primary';
    proceedBtn.textContent = 'Import';
    actions.append(cancelBtn, proceedBtn);

    form.append(title, meta, sampleTitle, tableWrap, actions);
    dialog.append(form);
    const closeModal = openModal(dialog, proceedBtn);
    let resolved = false;

    cancelBtn.addEventListener('click', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(null);
    });

    dialog.addEventListener('cancel', () => {
      if (resolved) return;
      resolved = true;
      closeModal();
      resolve(null);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (resolved) return;
      resolved = true;
      const mapping = {};
      for (const [field, select] of selects.entries()) {
        mapping[field] = select.value || '';
      }
      closeModal();
      resolve(mapping);
    });
  });
}
