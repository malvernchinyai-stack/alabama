// item-editor.js — reusable line-item editor for Quotes, BOQs and Invoices.
import { uid, money, calcTotals, escapeHtml, convert } from './utils.js';

const COMMON_UNITS = ['pc', 'set', 'm', 'pair', 'lump sum', 'hr', 'trip', 'kg', 'box'];

export function createItemsEditor({ container, catalog, settings, initialItems, onTotalsChange }) {
  let items = (initialItems && initialItems.length)
    ? initialItems.map((it) => ({ id: it.id || uid(), ...it }))
    : [];

  const categories = [...new Set(catalog.map((c) => c.category))];

  function catalogOptionsHtml(selectedId) {
    let html = `<option value="">+ Pick from catalog…</option>`;
    categories.forEach((cat) => {
      html += `<optgroup label="${escapeHtml(cat)}">`;
      catalog.filter((c) => c.category === cat).forEach((c) => {
        html += `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)} (${money(c.unitPrice, settings.currency)}/${escapeHtml(c.unit)})</option>`;
      });
      html += `</optgroup>`;
    });
    return html;
  }

  function unitOptionsHtml(selected) {
    const opts = COMMON_UNITS.includes(selected) || !selected ? COMMON_UNITS : [selected, ...COMMON_UNITS];
    return opts.map((u) => `<option value="${u}" ${u === selected ? 'selected' : ''}>${u}</option>`).join('');
  }

  function rowHtml(item, idx) {
    const lineTotal = Number(item.qty || 0) * Number(item.unitPrice || 0);
    return `
    <div class="item-row" data-idx="${idx}">
      <div class="item-row-top">
        <select class="catalog-pick">${catalogOptionsHtml(item.catalogId)}</select>
        <button type="button" class="remove-item-btn" data-remove>&times;</button>
      </div>
      <div class="field" style="margin-top:8px;margin-bottom:0;">
        <input type="text" class="desc-input" placeholder="Item description" value="${escapeHtml(item.description || '')}" />
      </div>
      <div class="field-row" style="margin-top:8px;">
        <div class="field" style="margin-bottom:0;">
          <label>Category</label>
          <input type="text" class="cat-input" placeholder="e.g. Solar Panel" value="${escapeHtml(item.category || '')}" list="cat-suggest-${idx}"/>
          <datalist id="cat-suggest-${idx}">${categories.map((c) => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
        </div>
      </div>
      <div class="item-grid">
        <div class="field" style="margin-bottom:0;">
          <label>Unit</label>
          <select class="unit-input">${unitOptionsHtml(item.unit)}</select>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Qty</label>
          <input type="number" class="qty-input" min="0" step="any" value="${item.qty ?? 1}" />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>Unit Price</label>
          <input type="number" class="price-input" min="0" step="0.01" value="${item.unitPrice ?? 0}" />
        </div>
      </div>
      <div class="item-line-total">${money(lineTotal, settings.currency)}</div>
    </div>`;
  }

  function totalsHtml() {
    const t = calcTotals(items, settings.vatEnabled, settings.vatRate);
    const conv = settings.enableSecondaryCurrency ? convert(t.total, settings) : null;
    return `
      <div class="totals-box">
        <div class="totals-row"><span>Subtotal</span><span>${money(t.subtotal, settings.currency)}</span></div>
        ${settings.vatEnabled ? `<div class="totals-row"><span>VAT (${settings.vatRate}%)</span><span>${money(t.vatAmount, settings.currency)}</span></div>` : ''}
        <div class="totals-row grand"><span>Total</span><span>${money(t.total, settings.currency)}</span></div>
        ${conv !== null ? `<div class="totals-row"><span class="muted">≈ ${settings.secondaryCurrency}</span><span class="muted">${money(conv, settings.secondaryCurrency)}</span></div>` : ''}
      </div>`;
  }

  function fullRender() {
    container.innerHTML = `
      <div class="items-list">${items.map(rowHtml).join('') || '<p class="hint">No items yet — add one below.</p>'}</div>
      <button type="button" class="btn btn-outline btn-block" data-add-item>+ Add Item</button>
      ${totalsHtml()}
    `;
    attachHandlers();
    if (onTotalsChange) onTotalsChange(calcTotals(items, settings.vatEnabled, settings.vatRate));
  }

  function attachHandlers() {
    container.querySelector('[data-add-item]').addEventListener('click', () => {
      items.push({ id: uid(), description: '', category: '', unit: 'pc', qty: 1, unitPrice: 0 });
      fullRender();
    });
    container.querySelectorAll('.item-row').forEach((rowEl) => {
      const idx = Number(rowEl.dataset.idx);
      rowEl.querySelector('[data-remove]').addEventListener('click', () => {
        items.splice(idx, 1);
        fullRender();
      });
      rowEl.querySelector('.catalog-pick').addEventListener('change', (e) => {
        const cat = catalog.find((c) => c.id === e.target.value);
        if (cat) {
          items[idx] = { ...items[idx], catalogId: cat.id, description: cat.name, category: cat.category, unit: cat.unit, unitPrice: cat.unitPrice };
          fullRender();
        }
      });
      rowEl.querySelector('.desc-input').addEventListener('input', (e) => { items[idx].description = e.target.value; });
      rowEl.querySelector('.cat-input').addEventListener('input', (e) => { items[idx].category = e.target.value; });
      rowEl.querySelector('.unit-input').addEventListener('change', (e) => { items[idx].unit = e.target.value; });
      rowEl.querySelector('.qty-input').addEventListener('input', (e) => {
        items[idx].qty = Number(e.target.value);
        rowEl.querySelector('.item-line-total').textContent = money(items[idx].qty * items[idx].unitPrice, settings.currency);
        refreshTotalsOnly();
      });
      rowEl.querySelector('.price-input').addEventListener('input', (e) => {
        items[idx].unitPrice = Number(e.target.value);
        rowEl.querySelector('.item-line-total').textContent = money(items[idx].qty * items[idx].unitPrice, settings.currency);
        refreshTotalsOnly();
      });
    });
  }

  function refreshTotalsOnly() {
    const box = container.querySelector('.totals-box');
    if (box) box.outerHTML = totalsHtml();
    if (onTotalsChange) onTotalsChange(calcTotals(items, settings.vatEnabled, settings.vatRate));
  }

  fullRender();

  return {
    getItems: () => items.filter((it) => (it.description && it.description.trim()) || Number(it.qty) > 0),
    getTotals: () => calcTotals(items, settings.vatEnabled, settings.vatRate),
    setItems: (newItems) => { items = newItems.map((it) => ({ id: it.id || uid(), ...it })); fullRender(); },
  };
}
