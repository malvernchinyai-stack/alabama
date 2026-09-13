import { DB } from '../db.js';
import { getSettings } from '../app.js';
import { uid, money, escapeHtml, toast } from '../utils.js';
import { openModal, closeModal, confirmDialog } from '../ui.js';

function formHtml(item = {}) {
  return `
    <div class="field"><label>Item Name *</label><input id="f-name" value="${escapeHtml(item.name || '')}" placeholder="e.g. 450W Monocrystalline Panel" /></div>
    <div class="field"><label>Category</label><input id="f-category" value="${escapeHtml(item.category || '')}" placeholder="e.g. Solar Panel, Inverter, Electrical Installation" list="cat-list"/>
      <datalist id="cat-list">
        <option value="Solar Panel"><option value="Inverter"><option value="Battery"><option value="Solar Package">
        <option value="Mounting"><option value="Solar Accessories"><option value="Electrical Installation">
        <option value="Labour"><option value="Other">
      </datalist>
    </div>
    <div class="field-row">
      <div class="field"><label>Unit</label><input id="f-unit" value="${escapeHtml(item.unit || 'pc')}" /></div>
      <div class="field"><label>Unit Price (USD)</label><input id="f-price" type="number" min="0" step="0.01" value="${item.unitPrice ?? 0}" /></div>
    </div>
    <div class="field"><label>Description (optional)</label><textarea id="f-desc">${escapeHtml(item.description || '')}</textarea></div>
  `;
}

async function render(root) {
  const settings = getSettings();
  const items = (await DB.getAll('catalog')).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  function grouped(list) {
    const byCategory = {};
    list.forEach((it) => { (byCategory[it.category || 'Other'] ??= []).push(it); });
    return byCategory;
  }

  function listHtml(list) {
    if (!list.length) return '<div class="empty-state"><div class="emoji">📦</div>No catalog items yet.</div>';
    const g = grouped(list);
    return Object.keys(g).sort().map((cat) => `
      <div class="section-title">${escapeHtml(cat)}</div>
      ${g[cat].map((it) => `
        <div class="list-item" data-id="${it.id}">
          <div class="li-icon">🔧</div>
          <div class="li-main"><div class="li-title">${escapeHtml(it.name)}</div><div class="li-sub">per ${escapeHtml(it.unit)}</div></div>
          <div class="li-amount">${money(it.unitPrice, settings.currency)}</div>
        </div>`).join('')}
    `).join('');
  }

  root.innerHTML = `
    <input type="text" id="search-catalog" placeholder="Search catalog…" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--color-border);margin-bottom:4px;" />
    <div id="catalog-list">${listHtml(items)}</div>
    <button class="fab" id="add-item-fab" title="Add Item">+</button>
  `;

  function openItemForm(existing) {
    openModal({
      centered: true,
      title: existing ? 'Edit Item' : 'New Catalog Item',
      bodyHtml: formHtml(existing || {}),
      footerHtml: existing
        ? `<button class="btn btn-danger-outline" id="del-item">Delete</button><button class="btn btn-primary btn-block" id="save-item">Save</button>`
        : `<button class="btn btn-outline btn-block" data-close-modal>Cancel</button><button class="btn btn-primary btn-block" id="save-item">Save</button>`,
      onMount: (el) => {
        el.querySelector('#save-item').addEventListener('click', async () => {
          const name = el.querySelector('#f-name').value.trim();
          if (!name) { toast('Item name is required', 'error'); return; }
          const item = {
            id: existing?.id || uid(),
            name,
            category: el.querySelector('#f-category').value.trim() || 'Other',
            unit: el.querySelector('#f-unit').value.trim() || 'pc',
            unitPrice: Number(el.querySelector('#f-price').value || 0),
            description: el.querySelector('#f-desc').value.trim(),
            createdAt: existing?.createdAt || new Date().toISOString(),
          };
          await DB.put('catalog', item);
          closeModal();
          toast('Item saved', 'success');
          render(root);
        });
        if (existing) {
          el.querySelector('#del-item').addEventListener('click', async () => {
            const ok = await confirmDialog(`Delete "${existing.name}" from catalog?`);
            if (ok) { await DB.delete('catalog', existing.id); closeModal(); toast('Item deleted'); render(root); }
          });
        }
      },
    });
  }

  root.querySelectorAll('[data-id]').forEach((row) => {
    row.addEventListener('click', () => openItemForm(items.find((x) => x.id === row.dataset.id)));
  });
  root.querySelector('#add-item-fab').addEventListener('click', () => openItemForm(null));
  root.querySelector('#search-catalog').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    root.querySelector('#catalog-list').innerHTML = listHtml(items.filter((it) => it.name.toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q)));
    root.querySelectorAll('[data-id]').forEach((row) => {
      row.addEventListener('click', () => openItemForm(items.find((x) => x.id === row.dataset.id)));
    });
  });
}

export default { render };
