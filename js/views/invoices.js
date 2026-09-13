import { DB } from '../db.js';
import { getSettings } from '../app.js';
import {
  uid, money, fmtDate, todayISO, addDays, escapeHtml, nextDocNumber, statusBadge, toast,
  shareOrDownload, convert, paymentStatus, isOverdue,
} from '../utils.js';
import { openModal, closeModal, confirmDialog } from '../ui.js';
import { createItemsEditor } from '../item-editor.js';
import clientsView from './clients.js';
import { buildInvoicePDF, buildPaymentReceiptPDF } from '../pdf.js';

const PAYMENT_METHODS = ['Cash', 'EcoCash', 'Bank Transfer', 'Swipe / POS', 'Other'];

function paidTotal(invoice) {
  return (invoice.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
}

function docState(invoice) {
  if (invoice.status === 'draft') return 'draft';
  const received = paidTotal(invoice);
  const pay = paymentStatus(invoice.total, received);
  if (pay === 'paid') return 'paid';
  if (isOverdue(invoice, received)) return 'overdue';
  return 'sent';
}

async function renderList(root) {
  const settings = getSettings();
  const invoices = (await DB.getAll('invoices')).sort((a, b) => new Date(b.date) - new Date(a.date));

  function listHtml(list) {
    if (!list.length) return '<div class="empty-state"><div class="emoji">🧾</div>No invoices yet. Tap + to create one, or convert a Quote.</div>';
    return list.map((inv) => {
      const received = paidTotal(inv);
      const pay = paymentStatus(inv.total, received);
      const overdue = isOverdue(inv, received);
      return `
      <div class="list-item" data-id="${inv.id}">
        <div class="li-icon">🧾</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(inv.client?.name || 'Walk-in Customer')}</div>
          <div class="li-sub">${escapeHtml(inv.invoiceNumber)} · Due ${fmtDate(inv.dueDate)} ${inv.status === 'draft' ? statusBadge('draft') : statusBadge(overdue ? 'overdue' : pay)}</div>
        </div>
        <div class="li-amount">${money(inv.total, settings.currency)}</div>
      </div>`;
    }).join('');
  }

  const tabs = ['all', 'draft', 'sent', 'overdue', 'paid'];
  root.innerHTML = `
    <div class="tabs" id="status-tabs">
      ${tabs.map((s) => `<button class="tab-btn ${s === 'all' ? 'active' : ''}" data-status="${s}">${s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>
    <div id="invoices-list">${listHtml(invoices)}</div>
    <a class="fab" href="#/invoices/new" title="New Invoice">+</a>
  `;

  function wireRows() {
    root.querySelectorAll('[data-id]').forEach((row) => {
      row.addEventListener('click', () => { location.hash = `#/invoices/${row.dataset.id}`; });
    });
  }
  wireRows();

  root.querySelectorAll('#status-tabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('#status-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const s = btn.dataset.status;
      const filtered = s === 'all' ? invoices : invoices.filter((inv) => docState(inv) === s);
      root.querySelector('#invoices-list').innerHTML = listHtml(filtered);
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

async function renderForm(root, { id, prefillFromQuoteId } = {}) {
  const settings = getSettings();
  const catalog = await DB.getAll('catalog');
  const existing = id ? await DB.get('invoices', id) : null;
  let quoteSource = null;
  if (!existing && prefillFromQuoteId) quoteSource = await DB.get('quotes', prefillFromQuoteId);

  let selectedClient = existing?.client || quoteSource?.client || null;

  root.innerHTML = `
    <div class="card">
      <div id="client-picker-container">${clientPickerBlock(selectedClient)}</div>
      <div class="field"><label>Project / Description (optional)</label><input id="f-title" value="${escapeHtml(existing?.projectTitle || quoteSource?.projectTitle || '')}" placeholder="e.g. 5kW Residential Solar Installation" /></div>
      <div class="field-row">
        <div class="field"><label>Invoice Date</label><input id="f-date" type="date" value="${existing?.date || todayISO()}" /></div>
        <div class="field"><label>Due Date</label><input id="f-due" type="date" value="${existing?.dueDate || addDays(todayISO(), settings.invoiceDueDays)}" /></div>
      </div>
    </div>

    <div class="section-title">Items</div>
    <div class="card"><div id="items-editor-root"></div></div>

    <div class="section-title">Payment Instructions / Notes</div>
    <div class="card"><textarea id="f-notes" style="min-height:90px;">${escapeHtml(existing?.notes ?? settings.invoiceNotes)}</textarea></div>

    <div class="btn-row" style="margin-top:6px;">
      <button class="btn btn-outline" id="cancel-btn" style="flex:1;">Cancel</button>
      <button class="btn btn-primary" id="save-btn" style="flex:2;">Save Invoice</button>
    </div>
  `;

  const editor = createItemsEditor({
    container: document.getElementById('items-editor-root'),
    catalog,
    settings,
    initialItems: existing?.items || quoteSource?.items || [],
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
    let invoiceNumber = existing?.invoiceNumber;
    if (!invoiceNumber) {
      invoiceNumber = nextDocNumber(settings.invoicePrefix, settings.nextInvoiceNumber);
      settings.nextInvoiceNumber += 1;
      await DB.put('settings', settings);
    }
    const invoice = {
      id: existing?.id || uid(),
      invoiceNumber,
      client: selectedClient || { name: 'Walk-in Customer' },
      clientId: selectedClient?.id || null,
      projectTitle: document.getElementById('f-title').value.trim(),
      date: document.getElementById('f-date').value || todayISO(),
      dueDate: document.getElementById('f-due').value || todayISO(),
      items,
      subtotal: totals.subtotal,
      vatEnabled: settings.vatEnabled,
      vatRate: settings.vatRate,
      vatAmount: totals.vatAmount,
      total: totals.total,
      currency: settings.currency,
      notes: document.getElementById('f-notes').value,
      status: existing?.status || 'draft',
      payments: existing?.payments || [],
      sourceQuoteId: existing?.sourceQuoteId || quoteSource?.id || null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await DB.put('invoices', invoice);
    if (quoteSource) {
      quoteSource.linkedInvoiceId = invoice.id;
      await DB.put('quotes', quoteSource);
    }
    toast('Invoice saved', 'success');
    location.hash = `#/invoices/${invoice.id}`;
  });
}

function openRecordPaymentModal(invoice, settings, onSaved) {
  const balance = Math.max(0, invoice.total - paidTotal(invoice));
  openModal({
    centered: true,
    title: 'Record Payment',
    bodyHtml: `
      <div class="field"><label>Balance Due</label><input value="${money(balance, settings.currency)}" disabled /></div>
      <div class="field-row">
        <div class="field"><label>Amount (${settings.currency})</label><input id="f-pay-amount" type="number" min="0" step="0.01" value="${balance.toFixed(2)}" /></div>
        <div class="field"><label>Date</label><input id="f-pay-date" type="date" value="${todayISO()}" /></div>
      </div>
      <div class="field"><label>Payment Method</label><select id="f-pay-method">${PAYMENT_METHODS.map((m) => `<option>${m}</option>`).join('')}</select></div>
      <div class="field"><label>Notes</label><textarea id="f-pay-notes"></textarea></div>
    `,
    footerHtml: `<button class="btn btn-outline btn-block" data-close-modal>Cancel</button><button class="btn btn-primary btn-block" id="save-payment">Save Payment</button>`,
    onMount: (el) => {
      el.querySelector('#save-payment').addEventListener('click', async () => {
        const amount = Number(el.querySelector('#f-pay-amount').value || 0);
        if (amount <= 0) { toast('Enter a payment amount', 'error'); return; }
        const payment = {
          id: uid(),
          amount,
          date: el.querySelector('#f-pay-date').value || todayISO(),
          method: el.querySelector('#f-pay-method').value,
          notes: el.querySelector('#f-pay-notes').value.trim(),
          createdAt: new Date().toISOString(),
        };
        invoice.payments = invoice.payments || [];
        invoice.payments.push(payment);
        invoice.updatedAt = new Date().toISOString();
        await DB.put('invoices', invoice);
        closeModal();
        toast('Payment recorded', 'success');
        onSaved && onSaved();
      });
    },
  });
}

async function renderView(root, { id }) {
  const settings = getSettings();
  const invoice = await DB.get('invoices', id);
  if (!invoice) { root.innerHTML = '<div class="empty-state">Invoice not found.</div>'; return; }
  const received = paidTotal(invoice);
  const balance = Math.max(0, invoice.total - received);
  const pay = paymentStatus(invoice.total, received);
  const overdue = isOverdue(invoice, received);
  const conv = settings.enableSecondaryCurrency ? convert(invoice.total, settings) : null;
  const payments = invoice.payments || [];

  root.innerHTML = `
    <div class="card">
      <div class="doc-preview-header">
        <div>
          <div class="doc-number">${escapeHtml(invoice.invoiceNumber)}</div>
          <div class="hint">${fmtDate(invoice.date)} · Due ${fmtDate(invoice.dueDate)}</div>
        </div>
        <div>${invoice.status === 'draft' ? statusBadge('draft') : statusBadge(overdue ? 'overdue' : pay)}</div>
      </div>
      <div class="divider"></div>
      <div class="kv-list">
        <div class="kv-row"><span>Client</span><span>${escapeHtml(invoice.client?.name || '')}</span></div>
        ${invoice.projectTitle ? `<div class="kv-row"><span>Project</span><span>${escapeHtml(invoice.projectTitle)}</span></div>` : ''}
        <div class="kv-row"><span>Items</span><span>${invoice.items.length}</span></div>
        <div class="kv-row"><span>Subtotal</span><span>${money(invoice.subtotal, settings.currency)}</span></div>
        ${invoice.vatEnabled ? `<div class="kv-row"><span>VAT (${invoice.vatRate}%)</span><span>${money(invoice.vatAmount, settings.currency)}</span></div>` : ''}
        <div class="kv-row"><strong>Total</strong><strong>${money(invoice.total, settings.currency)}</strong></div>
        ${conv !== null ? `<div class="kv-row"><span class="muted">≈ ${settings.secondaryCurrency}</span><span class="muted">${money(conv, settings.secondaryCurrency)}</span></div>` : ''}
        <div class="kv-row"><span>Amount Paid</span><span>${money(received, settings.currency)}</span></div>
        <div class="kv-row"><strong>Balance Due</strong><strong>${money(balance, settings.currency)}</strong></div>
      </div>
    </div>

    <div class="section-title">Actions</div>
    <div class="btn-row">
      ${invoice.status === 'draft' ? `<button class="btn btn-primary" id="send-btn">✅ Mark as Sent</button>` : ''}
      <button class="btn btn-outline" id="edit-btn">✏️ Edit</button>
      <button class="btn btn-outline" id="pdf-btn">⬇️ Download PDF</button>
      <button class="btn btn-outline" id="share-btn">📤 Share</button>
      ${balance > 0.005 ? `<button class="btn btn-accent" id="record-payment-btn">💰 Record Payment</button>` : ''}
      ${invoice.sourceQuoteId ? `<a class="btn btn-outline" href="#/quotes/${invoice.sourceQuoteId}">View Source Quote</a>` : ''}
      <button class="btn btn-danger-outline" id="delete-btn">🗑 Delete</button>
    </div>

    ${payments.length ? `
      <div class="section-title">Payments Received</div>
      ${payments.map((p, idx) => `
        <div class="list-item" data-payment-idx="${idx}" style="cursor:default;">
          <div class="li-icon">🧾</div>
          <div class="li-main"><div class="li-title">${money(p.amount, settings.currency)}</div><div class="li-sub">${fmtDate(p.date)} · ${escapeHtml(p.method || '')}</div></div>
          <button class="btn btn-outline btn-sm" data-receipt-idx="${idx}">Receipt</button>
        </div>`).join('')}
    ` : ''}
  `;

  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.addEventListener('click', async () => {
    invoice.status = 'sent';
    invoice.updatedAt = new Date().toISOString();
    await DB.put('invoices', invoice);
    toast('Invoice marked as sent', 'success');
    renderView(root, { id });
  });
  document.getElementById('edit-btn').addEventListener('click', () => { location.hash = `#/invoices/${id}/edit`; });
  document.getElementById('pdf-btn').addEventListener('click', () => {
    const doc = buildInvoicePDF(invoice, settings);
    doc.save(`${invoice.invoiceNumber}.pdf`);
  });
  document.getElementById('share-btn').addEventListener('click', async () => {
    const doc = buildInvoicePDF(invoice, settings);
    await shareOrDownload(doc.output('blob'), `${invoice.invoiceNumber}.pdf`);
  });
  const recordBtn = document.getElementById('record-payment-btn');
  if (recordBtn) recordBtn.addEventListener('click', () => {
    openRecordPaymentModal(invoice, settings, () => renderView(root, { id }));
  });
  root.querySelectorAll('[data-receipt-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.receiptIdx);
      const doc = buildPaymentReceiptPDF(invoice, payments[idx], idx, settings);
      doc.save(`${invoice.invoiceNumber}-receipt-${idx + 1}.pdf`);
    });
  });
  document.getElementById('delete-btn').addEventListener('click', async () => {
    const ok = await confirmDialog(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`);
    if (ok) { await DB.delete('invoices', id); toast('Invoice deleted'); location.hash = '#/invoices'; }
  });
}

async function render(root, { action, id, query }) {
  if (action === 'list') return renderList(root);
  if (action === 'new') return renderForm(root, { prefillFromQuoteId: query?.fromQuote });
  if (action === 'edit') return renderForm(root, { id });
  if (action === 'view') return renderView(root, { id });
}

export default { render, singular: 'Invoice', listSubtitle: 'Bill clients & track payments' };
