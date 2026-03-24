import { filterEntries } from '../export.js';
import { getState } from '../state.js';
import { formatHours } from '../security.js';

const PROFILE_KEY = 'hourzy:invoice-profile';
const COUNTER_KEY = 'hourzy:invoice-counter';

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function nextInvoiceNumber() {
  const n = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10) + 1;
  localStorage.setItem(COUNTER_KEY, String(n));
  return `INV-${String(n).padStart(3, '0')}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function appendMultilineText(el, text) {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    el.append(document.createTextNode(lines[i]));
    if (i < lines.length - 1) el.append(document.createElement('br'));
  }
}

export function renderInvoiceView(root) {
  const state = getState();

  const pageHeader = document.createElement('div');
  const pageTitle = document.createElement('h1');
  pageTitle.className = 'page-title';
  pageTitle.textContent = 'Invoices';
  const pageSubtitle = document.createElement('p');
  pageSubtitle.className = 'page-subtitle';
  pageSubtitle.textContent = 'Create a professional invoice from your tracked time.';
  pageHeader.append(pageTitle, pageSubtitle);
  root.append(pageHeader);

  const profile = loadProfile();

  // Profile + options card
  const settingsCard = document.createElement('section');
  settingsCard.className = 'card';

  const profileTitle = document.createElement('h3');
  profileTitle.textContent = 'Invoice profile';
  settingsCard.append(profileTitle);

  const profileGrid = document.createElement('div');
  profileGrid.className = 'grid two';

  function makeField(id, labelText, value, placeholder, multiline) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.textContent = labelText;
    let input;
    if (multiline) {
      input = document.createElement('textarea');
      input.rows = 3;
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.id = id;
    input.value = value || '';
    if (placeholder) input.placeholder = placeholder;
    wrap.append(lbl, input);
    return { wrap, input };
  }

  const { wrap: yourNameWrap, input: yourNameInput } = makeField('invYourName', 'Your name / company', profile.yourName, 'Freelancer LLC');
  const { wrap: yourAddrWrap, input: yourAddrInput } = makeField('invYourAddr', 'Your address', profile.yourAddr, '123 Main St\nCity, State 12345', true);
  const { wrap: clientNameWrap, input: clientNameInput } = makeField('invClientName', 'Client name', profile.clientName, 'Client Company Inc.');
  const { wrap: clientAddrWrap, input: clientAddrInput } = makeField('invClientAddr', 'Client address', profile.clientAddr, '456 Client Ave\nCity, State 12345', true);

  const rateWrap = document.createElement('div');
  rateWrap.className = 'field';
  const rateLbl = document.createElement('label');
  rateLbl.htmlFor = 'invRate';
  rateLbl.textContent = 'Hourly rate ($)';
  const rateInput = document.createElement('input');
  rateInput.id = 'invRate';
  rateInput.type = 'number';
  rateInput.min = '0';
  rateInput.step = '0.01';
  rateInput.value = profile.rate || '';
  rateInput.placeholder = '100.00';
  rateWrap.append(rateLbl, rateInput);

  const notesWrap = document.createElement('div');
  notesWrap.className = 'field';
  const notesLbl = document.createElement('label');
  notesLbl.htmlFor = 'invNotes';
  notesLbl.textContent = 'Notes (optional)';
  const notesInput = document.createElement('textarea');
  notesInput.id = 'invNotes';
  notesInput.rows = 2;
  notesInput.value = profile.notes || '';
  notesInput.placeholder = 'Payment terms, bank details…';
  notesWrap.append(notesLbl, notesInput);

  profileGrid.append(yourNameWrap, yourAddrWrap, clientNameWrap, clientAddrWrap, rateWrap, notesWrap);
  settingsCard.append(profileGrid);

  // Period selector
  const sep = document.createElement('hr');
  sep.className = 'section-sep';
  settingsCard.append(sep);

  const periodTitle = document.createElement('h3');
  periodTitle.textContent = 'Invoice period';
  settingsCard.append(periodTitle);

  const periodGrid = document.createElement('div');
  periodGrid.className = 'grid two';

  const fromWrap = document.createElement('div');
  fromWrap.className = 'field';
  const fromLbl = document.createElement('label');
  fromLbl.htmlFor = 'invFrom';
  fromLbl.textContent = 'From';
  const fromInput = document.createElement('input');
  fromInput.id = 'invFrom';
  fromInput.type = 'date';
  fromInput.value = state.ui.filters.from || '';
  fromWrap.append(fromLbl, fromInput);

  const toWrap = document.createElement('div');
  toWrap.className = 'field';
  const toLbl = document.createElement('label');
  toLbl.htmlFor = 'invTo';
  toLbl.textContent = 'To';
  const toInput = document.createElement('input');
  toInput.id = 'invTo';
  toInput.type = 'date';
  toInput.value = state.ui.filters.to || '';
  toWrap.append(toLbl, toInput);

  const projWrap = document.createElement('div');
  projWrap.className = 'field';
  const projLbl = document.createElement('label');
  projLbl.htmlFor = 'invProject';
  projLbl.textContent = 'Project';
  const projSelect = document.createElement('select');
  projSelect.id = 'invProject';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All projects';
  projSelect.append(allOpt);
  for (const project of state.projects) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.name;
    projSelect.append(opt);
  }
  projSelect.value = 'all';
  projWrap.append(projLbl, projSelect);

  periodGrid.append(fromWrap, toWrap, projWrap);
  settingsCard.append(periodGrid);

  const generateBtn = document.createElement('button');
  generateBtn.className = 'primary';
  generateBtn.style.marginTop = '8px';
  generateBtn.textContent = 'Generate invoice';
  settingsCard.append(generateBtn);

  root.append(settingsCard);

  // Preview area (populated on generate)
  const previewArea = document.createElement('div');
  root.append(previewArea);

  generateBtn.addEventListener('click', () => {
    saveProfile({
      yourName: yourNameInput.value,
      yourAddr: yourAddrInput.value,
      clientName: clientNameInput.value,
      clientAddr: clientAddrInput.value,
      rate: rateInput.value,
      notes: notesInput.value
    });

    const rate = parseFloat(rateInput.value) || 0;
    const filtered = filterEntries(state.entries, {
      from: fromInput.value,
      to: toInput.value,
      projectId: projSelect.value,
      timeZone: state.settings.timezone
    });

    previewArea.replaceChildren();

    if (!filtered.length) {
      const warn = document.createElement('section');
      warn.className = 'card';
      const wp = document.createElement('p');
      wp.className = 'muted';
      wp.textContent = 'No entries found for the selected period and project. Adjust the filters and try again.';
      warn.append(wp);
      previewArea.append(warn);
      return;
    }

    const invoiceNum = nextInvoiceNumber();
    const invDate = todayIso();
    const dueDate = addDays(invDate, 30);

    // Group entries by project
    const projectMap = new Map(state.projects.map((p) => [p.id, p.name]));
    const byProject = new Map();
    for (const entry of filtered) {
      const key = entry.projectId || null;
      const name = key ? (projectMap.get(key) || 'Unknown') : 'Unassigned';
      if (!byProject.has(key)) byProject.set(key, { name, ms: 0 });
      byProject.get(key).ms += entry.durationMs;
    }

    const lineItems = [...byProject.values()];
    const totalMs = lineItems.reduce((acc, item) => acc + item.ms, 0);
    const totalHours = totalMs / 3600000;
    const totalAmount = totalHours * rate;

    // Build invoice card
    const invoiceCard = document.createElement('section');
    invoiceCard.className = 'card invoice-card';

    const invoiceDoc = document.createElement('div');
    invoiceDoc.className = 'invoice-doc';

    // Header row: from + meta
    const header = document.createElement('div');
    header.className = 'invoice-header';

    const fromSection = document.createElement('div');
    fromSection.className = 'invoice-from';
    const fromName = document.createElement('h2');
    fromName.textContent = yourNameInput.value || 'Your Name';
    fromSection.append(fromName);
    if (yourAddrInput.value.trim()) {
      const fromAddr = document.createElement('p');
      appendMultilineText(fromAddr, yourAddrInput.value);
      fromSection.append(fromAddr);
    }

    const metaSection = document.createElement('div');
    metaSection.className = 'invoice-meta';
    const metaH1 = document.createElement('h1');
    metaH1.textContent = 'INVOICE';
    metaSection.append(metaH1);

    const metaTable = document.createElement('table');
    function metaRow(labelText, value) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = labelText;
      const td2 = document.createElement('td');
      td2.textContent = value;
      tr.append(td1, td2);
      return tr;
    }
    metaTable.append(
      metaRow('Invoice #', invoiceNum),
      metaRow('Date', invDate),
      metaRow('Due date', dueDate)
    );
    metaSection.append(metaTable);
    header.append(fromSection, metaSection);
    invoiceDoc.append(header);

    // Bill to
    const billTo = document.createElement('div');
    billTo.className = 'invoice-bill-to';
    const billToH3 = document.createElement('h3');
    billToH3.textContent = 'Bill to';
    billTo.append(billToH3);
    const billToName = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = clientNameInput.value || 'Client Name';
    billToName.append(strong);
    billTo.append(billToName);
    if (clientAddrInput.value.trim()) {
      const billToAddr = document.createElement('p');
      appendMultilineText(billToAddr, clientAddrInput.value);
      billTo.append(billToAddr);
    }
    invoiceDoc.append(billTo);

    // Line items
    const table = document.createElement('table');
    table.className = 'invoice-items';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Description', 'Hours', 'Rate', 'Amount'].forEach((labelText) => {
      const th = document.createElement('th');
      th.textContent = labelText;
      trh.append(th);
    });
    thead.append(trh);
    table.append(thead);

    const tbody = document.createElement('tbody');
    for (const item of lineItems) {
      const tr = document.createElement('tr');
      const hours = item.ms / 3600000;
      const amount = hours * rate;

      const tdDesc = document.createElement('td');
      tdDesc.textContent = item.name;
      const tdHours = document.createElement('td');
      tdHours.textContent = `${formatHours(item.ms)} h`;
      const tdRate = document.createElement('td');
      tdRate.textContent = rate > 0 ? `$${rate.toFixed(2)}/h` : '\u2014';
      const tdAmount = document.createElement('td');
      tdAmount.textContent = rate > 0 ? `$${amount.toFixed(2)}` : '\u2014';

      tr.append(tdDesc, tdHours, tdRate, tdAmount);
      tbody.append(tr);
    }
    table.append(tbody);
    invoiceDoc.append(table);

    // Totals block
    const totalsBlock = document.createElement('div');
    totalsBlock.className = 'invoice-totals-block';
    const totalsTable = document.createElement('table');
    totalsTable.className = 'invoice-totals';

    function totalRow(labelText, value, isTotal) {
      const tr = document.createElement('tr');
      if (isTotal) tr.className = 'total-row';
      const td1 = document.createElement('td');
      td1.textContent = labelText;
      const td2 = document.createElement('td');
      td2.textContent = value;
      tr.append(td1, td2);
      return tr;
    }

    totalsTable.append(totalRow('Total hours', `${formatHours(totalMs)} h`));
    if (rate > 0) {
      totalsTable.append(totalRow('Amount due', `$${totalAmount.toFixed(2)}`, true));
    }
    totalsBlock.append(totalsTable);
    invoiceDoc.append(totalsBlock);

    // Notes
    if (notesInput.value.trim()) {
      const notesDiv = document.createElement('div');
      notesDiv.className = 'invoice-notes';
      appendMultilineText(notesDiv, notesInput.value);
      invoiceDoc.append(notesDiv);
    }

    invoiceCard.append(invoiceDoc);

    // Print action
    const actions = document.createElement('div');
    actions.className = 'invoice-actions';
    const printBtn = document.createElement('button');
    printBtn.className = 'primary';
    printBtn.textContent = 'Print / Save as PDF';
    printBtn.addEventListener('click', () => window.print());
    actions.append(printBtn);
    invoiceCard.append(actions);

    previewArea.append(invoiceCard);
    invoiceCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
