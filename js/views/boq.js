import { DB } from '../db.js';
import { getSettings } from '../app.js';
import {
  uid, money, fmtDate, todayISO, escapeHtml, nextDocNumber, statusBadge, toast, shareOrDownload,
} from '../utils.js';
import { openModal, closeModal, confirmDialog } from '../ui.js';
import { createItemsEditor } from '../item-editor.js';
import clientsView from './clients.js';
import { buildBoqPDF } from '../pdf.js';

async function renderList(root) {
  const settings = getSettings();
  const boqs = (await DB.getAll('boqs')).sort((a, b) => new Date(b.date) - new Date(a.date));

  function listHtml(list) {
    if (!list.length) return '<div class="empty-state"><div class="emoji">🧱</div>No bills of quantities yet. Tap + to start one.</div>';
    return list.map((b) => `
      <div class="list-item" data-id="${b.id}">
        <div class="li-icon">🧱</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(b.title || b.client?.name || 'Untitled project')}</div>
          <div class="li-sub">${escapeHtml(b.boqNumber)} · ${fmtDate(b.date)} ${statusBadge(b.status)}</div>
        </div>
        <div class="li-amount">${money(b.total, settings.currency)}</div>
      </div>`).join('');
  }

  root.innerHTML = `<div id="boq-list">${listHtml(boqs)}</div><a class="fab" href="#/boq/new" title="New BOQ">+</a>`;
  root.querySelectorAll('[data-id]').forEach((row) => row.addEventListener('click', () => { location.hash = `#/boq/${row.dataset.id}`; }));
}

function clientPickerBlock(client) {
  return `
    <div class="field">
      <label>Client (optional)</label>
      <div class="list-item" id="client-picker-row" style="margin-bottom:0;">
        <div class="li-icon">👤</div>
        <div class="li-main">
          <div class="li-title">${client && client.name ? escapeHtml(client.name) : 'Tap to select a client'}</div>
          <div class="li-sub">${client ? escapeHtml([client.phone, client.email].filter(Boolean).join(' · ')) : 'BOQs can be prepared without a client yet'}</div>
        </div>
      </div>
    </div>`;
}

async function renderForm(root, { id } = {}) {
  const settings = getSettings();
  const catalog = await DB.getAll('catalog');
  const existing = id ? await DB.get('boqs', id) : null;
  let selectedClient = existing?.client || null;

  root.innerHTML = `
    <div class="card">
      <div class="field"><label>Project Title *</label><input id="f-title" value="${escapeHtml(existing?.title || '')}" placeholder="e.g. 10kW Off-Grid Solar System" /></div>
      <div class="field"><label>Project Location</label><input id="f-location" value="${escapeHtml(existing?.projectLocation || '')}" placeholder="e.g. Borrowdale, Harare" /></div>
      <div id="client-picker-container">${clientPickerBlock(selectedClient)}</div>
      <div class="field"><label>Date</label><input id="f-date" type="date" value="${existing?.date || todayISO()}" /></div>
    </div>

    <div class="section-title">Materials, Equipment &amp; Labour</div>
    <div class="card"><div id="items-editor-root"></div></div>

    <div class="section-title">Notes</div>
    <div class="card"><textarea id="f-notes" placeholder="Assumptions, exclusions, site conditions…">${escapeHtml(existing?.notes || '')}</textarea></div>

    <div class="btn-row" style="margin-top:6px;">
      <button class="btn btn-outline" id="cancel-btn" style="flex:1;">Cancel</button>
      <button class="btn btn-primary" id="save-btn" style="flex:2;">Save BOQ</button>
    </div>
  `;

  const editor = createItemsEditor({
    container: document.getElementById('items-editor-root'),
    catalog,
    settings,
    initialItems: existing?.items || [],
  });

  function wireClientPicker() {
    const row = document.getElementById('client-picker-row');
    if (row) row.addEventListener('click', onPickClient);
  }
  async function onPickClient() {
    const picked = await clientsView.pickClient();
    if (picked) {
      selectedClient = picked;
      document.getElementById('client-picker-container').innerHTML = clientPickerBlock(selectedClient);
      wireClientPicker();
    }
  }
  wireClientPicker();

  document.getElementById('cancel-btn').addEventListener('click', () => history.back());
  document.getElementById('save-btn').addEventListener('click', async () => {
    const title = document.getElementById('f-title').value.trim();
    if (!title) { toast('Project title is required', 'error'); return; }
    const items = editor.getItems();
    if (!items.length) { toast('Add at least one item', 'error'); return; }
    const totals = editor.getTotals();
    let boqNumber = existing?.boqNumber;
    if (!boqNumber) {
      boqNumber = nextDocNumber(settings.boqPrefix, settings.nextBoqNumber);
      settings.nextBoqNumber += 1;
      await DB.put('settings', settings);
    }
    const boq = {
      id: existing?.id || uid(),
      boqNumber,
      title,
      projectLocation: document.getElementById('f-location').value.trim(),
      client: selectedClient || null,
      clientId: selectedClient?.id || null,
      date: document.getElementById('f-date').value || todayISO(),
      items,
      subtotal: totals.subtotal,
      vatEnabled: settings.vatEnabled,
      vatRate: settings.vatRate,
      vatAmount: totals.vatAmount,
      total: totals.total,
      currency: settings.currency,
      notes: document.getElementById('f-notes').value.trim(),
      status: existing?.status || 'draft',
      linkedQuoteId: existing?.linkedQuoteId || null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await DB.put('boqs', boq);
    toast('BOQ saved', 'success');
    location.hash = `#/boq/${boq.id}`;
  });
}

async function renderView(root, { id }) {
  const settings = getSettings();
  const boq = await DB.get('boqs', id);
  if (!boq) { root.innerHTML = '<div class="empty-state">BOQ not found.</div>'; return; }

  root.innerHTML = `
    <div class="card">
      <div class="doc-preview-header">
        <div>
          <div class="doc-number">${escapeHtml(boq.boqNumber)}</div>
          <div class="hint">${fmtDate(boq.date)}${boq.projectLocation ? ' · ' + escapeHtml(boq.projectLocation) : ''}</div>
        </div>
        <div>${statusBadge(boq.status)}</div>
      </div>
      <div class="divider"></div>
      <div class="kv-list">
        <div class="kv-row"><span>Project</span><span>${escapeHtml(boq.title)}</span></div>
        ${boq.client ? `<div class="kv-row"><span>Client</span><span>${escapeHtml(boq.client.name)}</span></div>` : ''}
        <div class="kv-row"><span>Items</span><span>${boq.items.length}</span></div>
        <div class="kv-row"><span>Subtotal</span><span>${money(boq.subtotal, settings.currency)}</span></div>
        ${boq.vatEnabled ? `<div class="kv-row"><span>VAT (${boq.vatRate}%)</span><span>${money(boq.vatAmount, settings.currency)}</span></div>` : ''}
        <div class="kv-row"><strong>Total</strong><strong>${money(boq.total, settings.currency)}</strong></div>
      </div>
    </div>

    <div class="section-title">Actions</div>
    <div class="btn-row">
      <button class="btn btn-outline" id="edit-btn">✏️ Edit</button>
      <button class="btn btn-outline" id="pdf-btn">⬇️ Download PDF</button>
      <button class="btn btn-outline" id="share-btn">📤 Share</button>
      ${boq.status !== 'converted' ? `<button class="btn btn-accent" id="convert-btn">➜ Convert to Quote</button>` : `<a class="btn btn-outline" href="#/quotes/${boq.linkedQuoteId}">View Linked Quote</a>`}
      ${boq.status === 'draft' ? `<button class="btn btn-outline" id="finalize-btn">✅ Mark Final</button>` : ''}
      <button class="btn btn-danger-outline" id="delete-btn">🗑 Delete</button>
    </div>
  `;

  document.getElementById('edit-btn').addEventListener('click', () => { location.hash = `#/boq/${id}/edit`; });
  document.getElementById('pdf-btn').addEventListener('click', () => {
    const doc = buildBoqPDF(boq, settings);
    doc.save(`${boq.boqNumber}.pdf`);
  });
  document.getElementById('share-btn').addEventListener('click', async () => {
    const doc = buildBoqPDF(boq, settings);
    await shareOrDownload(doc.output('blob'), `${boq.boqNumber}.pdf`);
  });
  const convertBtn = document.getElementById('convert-btn');
  if (convertBtn) convertBtn.addEventListener('click', () => { location.hash = `#/quotes/new?fromBoq=${boq.id}`; });
  const finalizeBtn = document.getElementById('finalize-btn');
  if (finalizeBtn) finalizeBtn.addEventListener('click', async () => {
    boq.status = 'final';
    await DB.put('boqs', boq);
    toast('BOQ marked final', 'success');
    renderView(root, { id });
  });
  document.getElementById('delete-btn').addEventListener('click', async () => {
    const ok = await confirmDialog(`Delete BOQ ${boq.boqNumber}? This cannot be undone.`);
    if (ok) { await DB.delete('boqs', id); toast('BOQ deleted'); location.hash = '#/boq'; }
  });
}

async function render(root, { action, id }) {
  if (action === 'list') return renderList(root);
  if (action === 'new') return renderForm(root, {});
  if (action === 'edit') return renderForm(root, { id });
  if (action === 'view') return renderView(root, { id });
}

export default { render, singular: 'BOQ', listSubtitle: 'Materials, labour & costing worksheets' };
