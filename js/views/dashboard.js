import { DB } from '../db.js';
import { getSettings } from '../app.js';
import { money, fmtDate, escapeHtml, paymentStatus, isOverdue } from '../utils.js';

function isSameMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function paidTotal(invoice) {
  return (invoice.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
}

async function render(root) {
  const settings = getSettings();
  const [quotes, boqs, invoices] = await Promise.all([
    DB.getAll('quotes'), DB.getAll('boqs'), DB.getAll('invoices'),
  ]);

  const outstanding = invoices
    .filter((inv) => inv.status !== 'draft')
    .reduce((sum, inv) => sum + Math.max(0, Number(inv.total || 0) - paidTotal(inv)), 0);

  const collectedThisMonth = invoices.reduce((sum, inv) => {
    const monthPayments = (inv.payments || []).filter((p) => isSameMonth(p.date));
    return sum + monthPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  }, 0);

  const openQuotes = quotes.filter((q) => ['draft', 'sent'].includes(q.status)).length;
  const overdueInvoices = invoices.filter((inv) => isOverdue(inv, paidTotal(inv))).length;

  const recent = [
    ...quotes.map((q) => ({ type: 'Quote', icon: '📄', route: `#/quotes/${q.id}`, title: q.client?.name || 'Unnamed client', number: q.quoteNumber, amount: q.total, date: q.date })),
    ...boqs.map((b) => ({ type: 'BOQ', icon: '🧱', route: `#/boq/${b.id}`, title: b.title || b.client?.name || 'Untitled project', number: b.boqNumber, amount: b.total, date: b.date })),
    ...invoices.map((inv) => ({ type: 'Invoice', icon: '🧾', route: `#/invoices/${inv.id}`, title: inv.client?.name || 'Walk-in', number: inv.invoiceNumber, amount: inv.total, date: inv.date })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  root.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile"><div class="stat-label">Open Quotes</div><div class="stat-value">${openQuotes}</div></div>
      <div class="stat-tile accent"><div class="stat-label">Outstanding</div><div class="stat-value">${money(outstanding, settings.currency)}</div></div>
      <div class="stat-tile"><div class="stat-label">Collected (This Month)</div><div class="stat-value">${money(collectedThisMonth, settings.currency)}</div></div>
      <div class="stat-tile ${overdueInvoices ? 'accent' : ''}"><div class="stat-label">Overdue Invoices</div><div class="stat-value">${overdueInvoices}</div></div>
    </div>

    <div class="btn-row" style="margin:14px 0 4px;">
      <a class="btn btn-primary" href="#/quotes/new" style="flex:1;">+ New Quote</a>
      <a class="btn btn-outline" href="#/invoices/new" style="flex:1;">+ New Invoice</a>
      <a class="btn btn-outline" href="#/boq/new" style="flex:1;">+ New BOQ</a>
    </div>

    <div class="section-title">Recent Activity</div>
    ${recent.length ? recent.map((r) => `
      <div class="list-item" data-go="${r.route}">
        <div class="li-icon">${r.icon}</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(r.title)}</div>
          <div class="li-sub">${r.type} · ${escapeHtml(r.number || '')} · ${fmtDate(r.date)}</div>
        </div>
        <div class="li-amount">${money(r.amount, settings.currency)}</div>
      </div>`).join('') : `<div class="empty-state"><div class="emoji">⚡</div>No documents yet. Create your first quote to get started.</div>`}
  `;

  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
}

export default { render };
