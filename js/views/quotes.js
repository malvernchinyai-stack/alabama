import { DB } from '../db.js';
import { getSettings } from '../app.js';
import {
  uid, money, fmtDate, todayISO, addDays, escapeHtml, nextDocNumber, statusBadge, toast, shareOrDownload, convert, pdfFilename,
} from '../utils.js';
import { confirmDialog } from '../ui.js';
import { createItemsEditor } from '../item-editor.js';
import clientsView from './clients.js';
import { buildQuotePDF } from '../pdf.js';

const STATUS_FLOW = ['draft', 'sent', 'accepted', 'declined', 'expired'];

async function renderList(root) {
  const settings = getSettings();
  const quotes = (await DB.getAll('quotes')).sort((a, b) => new Date(b.date) - new Date(a.date));

  function listHtml(list) {
    if (!list.length) return '<div class="empty-state"><div class="emoji">📄</div>No quotes yet. Tap + to create your first quote.</div>';
    return list.map((q) => `
      <div class="list-item" data-id="${q.id}">
        <div class="li-icon">📄</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(q.client?.name || 'Unnamed client')}</div>
          <div class="li-sub">${escapeHtml(q.quoteNumber)} · ${fmtDate(q.date)} ${statusBadge(q.status)} ${q.linkedInvoiceId ? statusBadge('invoiced') : ''}</div>
        </div>
        <div class="li-amount">${money(q.total, settings.currency)}</div>
      </div>`).join('');
  }

  root.innerHTML = `
    <div class="tabs" id="status-tabs">
      ${['all', ...STATUS_FLOW].map((s) => `<button class="tab-btn ${s === 'all' ? 'active' : ''}" data-status="${s}">${s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>
    <div id="quotes-list">${listHtml(quotes)}</div>
    <a class="fab" href="#/quotes/new" title="New Quote">+</a>
  `;

  function wireRows() {
    root.querySelectorAll('[data-id]').forEach((row) => {
      row.addEventListener('click', () => { location.hash = `#/quotes/${row.dataset.id}`; });
    });
  }
  wireRows();

  root.querySelectorAll('#status-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('#status-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const s = btn.dataset.status;
      const filtered = s === 'all' ? quotes : quotes.filter((q) => q.status === s);
      root.querySelector('#quotes-list').innerHTML = listHtml(filtered);
      wireRows();
    });
  });
}

function clientPickerBlock(client) {
  return `
    <div class="field">
      <label>Client</label>
      <div class="list-item" id="client-picker-row" style="margin-bottom:0;">
        <div class="li-icon">👤</div>
        <div class="li-main">
          <div class="li-title">${client && client.name ? escapeHtml(client.name) : 'Tap to select a client'}</div>
          <div class="li-sub">${client ? escapeHtml([client.phone, client.email].filter(Boolean).join(' · ')) : 'or leave blank for a walk-in customer'}</div>
        </div>
      </div>
    </div>`;
}

async function renderForm(root, { id, prefillFromBoqId } = {}) {
  const settings = getSettings();
  const catalog = await DB.getAll('catalog');
  const existing = id ? await DB.get('quotes', id) : null;
  let boqSource = null;
  if (!existing && prefillFromBoqId) boqSource = await DB.get('boqs', prefillFromBoqId);

  let selectedClient = existing?.client || boqSource?.client || null;

  root.innerHTML = `
    <div class="card">
      <div id="client-picker-container">${clientPickerBlock(selectedClient)}</div>
      <div class="field"><label>Project Title (optional)</label><input id="f-title" value="${escapeHtml(existing?.projectTitle || boqSource?.title || '')}" placeholder="e.g. 5kW Residential Solar Installation" /></div>
      <div class="field-row">
        <div class="field"><label>Quote Date</label><input id="f-date" type="date" value="${existing?.date || todayISO()}" /></div>
        <div class="field"><label>Valid Until</label><input id="f-valid" type="date" value="${existing?.validUntil || addDays(todayISO(), settings.quoteValidityDays)}" /></div>
      </div>
    </div>

    <div class="section-title">Items</div>
    <div class="card"><div id="items-editor-root"></div></div>

    <div class="section-title">Terms &amp; Conditions</div>
    <div class="card"><textarea id="f-terms" style="min-height:110px;">${escapeHtml(existing?.terms ?? settings.quoteTerms)}</textarea></div>

    <div class="btn-row" style="margin-top:6px;">
      <button class="btn btn-outline" id="cancel-btn" style="flex:1;">Cancel</button>
      <button class="btn btn-primary" id="save-btn" style="flex:2;">Save Quote</button>
    </div>
  `;

  const editor = createItemsEditor({
    container: document.getElementById('items-editor-root'),
    catalog,
    settings,
    initialItems: existing?.items || boqSource?.items || [],
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
    const items = editor.getItems();
    if (!items.length) { toast('Add at least one item', 'error'); return; }
    const totals = editor.getTotals();
    let quoteNumber = existing?.quoteNumber;
    if (!quoteNumber) {
      quoteNumber = nextDocNumber(settings.quotePrefix, settings.nextQuoteNumber);
      settings.nextQuoteNumber += 1;
      await DB.put('settings', settings);
    }
    const quote = {
      id: existing?.id || uid(),
      quoteNumber,
      client: selectedClient || { name: 'Walk-in Customer' },
      clientId: selectedClient?.id || null,
      projectTitle: document.getElementById('f-title').value.trim(),
      date: document.getElementById('f-date').value || todayISO(),
      validUntil: document.getElementById('f-valid').value,
      items,
      subtotal: totals.subtotal,
      vatEnabled: settings.vatEnabled,
      vatRate: settings.vatRate,
      vatAmount: totals.vatAmount,
      total: totals.total,
      currency: settings.currency,
      terms: document.getElementById('f-terms').value,
      status: existing?.status || 'draft',
      sourceBoqId: existing?.sourceBoqId || boqSource?.id || null,
      linkedInvoiceId: existing?.linkedInvoiceId || null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await DB.put('quotes', quote);
    if (boqSource) {
      boqSource.linkedQuoteId = quote.id;
      boqSource.status = 'converted';
      await DB.put('boqs', boqSource);
    }
    toast('Quote saved', 'success');
    location.hash = `#/quotes/${quote.id}`;
  });
}

async function renderView(root, { id }) {
  const settings = getSettings();
  const quote = await DB.get('quotes', id);
  if (!quote) { root.innerHTML = '<div class="empty-state">Quote not found.</div>'; return; }
  const conv = settings.enableSecondaryCurrency ? convert(quote.total, settings) : null;

  root.innerHTML = `
    <div class="card">
      <div class="doc-preview-header">
        <div>
          <div class="doc-number">${escapeHtml(quote.quoteNumber)}</div>
          <div class="hint">${fmtDate(quote.date)} · Valid until ${fmtDate(quote.validUntil)}</div>
        </div>
        <div>${statusBadge(quote.status)}</div>
      </div>
      <div class="divider"></div>
      <div class="kv-list">
        <div class="kv-row"><span>Client</span><span>${escapeHtml(quote.client?.name || '')}</span></div>
        ${quote.projectTitle ? `<div class="kv-row"><span>Project</span><span>${escapeHtml(quote.projectTitle)}</span></div>` : ''}
        <div class="kv-row"><span>Items</span><span>${quote.items.length}</span></div>
        <div class="kv-row"><span>Subtotal</span><span>${money(quote.subtotal, settings.currency)}</span></div>
        ${quote.vatEnabled ? `<div class="kv-row"><span>VAT (${quote.vatRate}%)</span><span>${money(quote.vatAmount, settings.currency)}</span></div>` : ''}
        <div class="kv-row"><strong>Total</strong><strong>${money(quote.total, settings.currency)}</strong></div>
        ${conv !== null ? `<div class="kv-row"><span class="muted">≈ ${settings.secondaryCurrency}</span><span class="muted">${money(conv, settings.secondaryCurrency)}</span></div>` : ''}
      </div>
    </div>

    <div class="section-title">Status</div>
    <div class="btn-row">
      ${STATUS_FLOW.map((s) => `<button class="btn btn-sm ${s === quote.status ? 'btn-primary' : 'btn-outline'}" data-set-status="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>

    <div class="section-title">Actions</div>
    <div class="btn-row">
      <button class="btn btn-outline" id="edit-btn">✏️ Edit</button>
      <button class="btn btn-outline" id="pdf-btn">⬇️ Download PDF</button>
      <button class="btn btn-outline" id="share-btn">📤 Share</button>
      ${quote.linkedInvoiceId
        ? `<a class="btn btn-outline" href="#/invoices/${quote.linkedInvoiceId}">View Linked Invoice</a>`
        : `<a class="btn btn-accent" href="#/invoices/new?fromQuote=${quote.id}">➜ Convert to Invoice</a>`}
      <button class="btn btn-danger-outline" id="delete-btn">🗑 Delete</button>
    </div>
  `;

  root.querySelectorAll('[data-set-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      quote.status = btn.dataset.setStatus;
      quote.updatedAt = new Date().toISOString();
      await DB.put('quotes', quote);
      toast(`Marked as ${quote.status}`, 'success');
      renderView(root, { id });
    });
  });
  document.getElementById('edit-btn').addEventListener('click', () => { location.hash = `#/quotes/${id}/edit`; });
  document.getElementById('pdf-btn').addEventListener('click', async () => {
    const doc = buildQuotePDF(quote, settings);
    doc.save(pdfFilename(quote.client?.name, quote.quoteNumber));
  });
  document.getElementById('share-btn').addEventListener('click', async () => {
    const doc = buildQuotePDF(quote, settings);
    const blob = doc.output('blob');
    await shareOrDownload(blob, pdfFilename(quote.client?.name, quote.quoteNumber));
  });
  document.getElementById('delete-btn').addEventListener('click', async () => {
    const ok = await confirmDialog(`Delete quote ${quote.quoteNumber}? This cannot be undone.`);
    if (ok) { await DB.delete('quotes', id); toast('Quote deleted'); location.hash = '#/quotes'; }
  });
}

async function render(root, { action, id, query }) {
  if (action === 'list') return renderList(root);
  if (action === 'new') return renderForm(root, { prefillFromBoqId: query?.fromBoq });
  if (action === 'edit') return renderForm(root, { id });
  if (action === 'view') return renderView(root, { id });
}

export default { render, singular: 'Quote', listSubtitle: 'Manage customer quotations' };
