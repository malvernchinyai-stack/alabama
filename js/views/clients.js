import { DB } from '../db.js';
import { uid, escapeHtml, toast } from '../utils.js';
import { openModal, closeModal, confirmDialog } from '../ui.js';

function clientFormHtml(c = {}) {
  return `
    <div class="field"><label>Client / Company Name *</label><input id="f-name" value="${escapeHtml(c.name || '')}" placeholder="e.g. John Moyo, or a company name" /></div>
    <div class="field"><label>Contact Person</label><input id="f-contact" value="${escapeHtml(c.contactPerson || '')}" /></div>
    <div class="field-row">
      <div class="field"><label>Phone</label><input id="f-phone" value="${escapeHtml(c.phone || '')}" /></div>
      <div class="field"><label>Email</label><input id="f-email" value="${escapeHtml(c.email || '')}" /></div>
    </div>
    <div class="field"><label>Address</label><textarea id="f-address">${escapeHtml(c.address || '')}</textarea></div>
    <div class="field"><label>Notes</label><textarea id="f-notes">${escapeHtml(c.notes || '')}</textarea></div>
  `;
}

function openClientForm(existing, onSaved) {
  openModal({
    centered: true,
    title: existing ? 'Edit Client' : 'New Client',
    bodyHtml: clientFormHtml(existing || {}),
    footerHtml: `<button class="btn btn-outline btn-block" data-close-modal>Cancel</button><button class="btn btn-primary btn-block" id="save-client">Save</button>`,
    onMount: (el) => {
      el.querySelector('#save-client').addEventListener('click', async () => {
        const name = el.querySelector('#f-name').value.trim();
        if (!name) { toast('Client name is required', 'error'); return; }
        const client = {
          id: existing?.id || uid(),
          name,
          contactPerson: el.querySelector('#f-contact').value.trim(),
          phone: el.querySelector('#f-phone').value.trim(),
          email: el.querySelector('#f-email').value.trim(),
          address: el.querySelector('#f-address').value.trim(),
          notes: el.querySelector('#f-notes').value.trim(),
          createdAt: existing?.createdAt || new Date().toISOString(),
        };
        await DB.put('clients', client);
        closeModal();
        toast('Client saved', 'success');
        onSaved && onSaved();
      });
    },
  });
}

export async function pickClient() {
  const clients = (await DB.getAll('clients')).sort((a, b) => a.name.localeCompare(b.name));
  return new Promise((resolve) => {
    openModal({
      centered: true,
      title: 'Select Client',
      bodyHtml: `
        <input type="text" id="client-search" placeholder="Search clients…" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--color-border);margin-bottom:10px;" />
        <div id="client-pick-list">${renderPickList(clients)}</div>
        <button class="btn btn-outline btn-block" id="add-new-client-inline" style="margin-top:10px;">+ Add New Client</button>
      `,
      onMount: (el) => {
        const listEl = el.querySelector('#client-pick-list');
        el.querySelector('#client-search').addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          listEl.innerHTML = renderPickList(clients.filter((c) => c.name.toLowerCase().includes(q)));
          wireList();
        });
        function wireList() {
          listEl.querySelectorAll('[data-pick]').forEach((row) => {
            row.addEventListener('click', () => {
              const c = clients.find((x) => x.id === row.dataset.pick);
              closeModal();
              resolve(c);
            });
          });
        }
        wireList();
        el.querySelector('#add-new-client-inline').addEventListener('click', () => {
          closeModal();
          openClientForm(null, async () => {
            const all = await DB.getAll('clients');
            resolve(all[all.length - 1]);
          });
        });
      },
    });
  });
}

function renderPickList(clients) {
  if (!clients.length) return '<p class="hint">No clients yet.</p>';
  return clients.map((c) => `
    <div class="list-item" data-pick="${c.id}">
      <div class="li-icon">👤</div>
      <div class="li-main"><div class="li-title">${escapeHtml(c.name)}</div><div class="li-sub">${escapeHtml(c.phone || c.email || '')}</div></div>
    </div>`).join('');
}

async function render(root) {
  const clients = (await DB.getAll('clients')).sort((a, b) => a.name.localeCompare(b.name));
  root.innerHTML = `
    <input type="text" id="search-clients" placeholder="Search clients…" style="width:100%;padding:10px 12px;border-radius:8px;border:1.5px solid var(--color-border);margin-bottom:12px;" />
    <div id="clients-list">${listHtml(clients)}</div>
    <button class="fab" id="add-client-fab" title="Add Client">+</button>
  `;

  function listHtml(list) {
    if (!list.length) return '<div class="empty-state"><div class="emoji">👥</div>No clients yet. Tap + to add one.</div>';
    return list.map((c) => `
      <div class="list-item" data-id="${c.id}">
        <div class="li-icon">👤</div>
        <div class="li-main">
          <div class="li-title">${escapeHtml(c.name)}</div>
          <div class="li-sub">${escapeHtml([c.phone, c.email].filter(Boolean).join(' · '))}</div>
        </div>
      </div>`).join('');
  }

  function wire() {
    root.querySelectorAll('[data-id]').forEach((row) => {
      row.addEventListener('click', async () => {
        const c = clients.find((x) => x.id === row.dataset.id);
        openModal({
          centered: true,
          title: c.name,
          bodyHtml: clientFormHtml(c),
          footerHtml: `<button class="btn btn-danger-outline" id="del-client">Delete</button><button class="btn btn-primary btn-block" id="save-client-edit">Save</button>`,
          onMount: (el) => {
            el.querySelector('#save-client-edit').addEventListener('click', async () => {
              const updated = {
                ...c,
                name: el.querySelector('#f-name').value.trim() || c.name,
                contactPerson: el.querySelector('#f-contact').value.trim(),
                phone: el.querySelector('#f-phone').value.trim(),
                email: el.querySelector('#f-email').value.trim(),
                address: el.querySelector('#f-address').value.trim(),
                notes: el.querySelector('#f-notes').value.trim(),
              };
              await DB.put('clients', updated);
              closeModal();
              toast('Client updated', 'success');
              render(root);
            });
            el.querySelector('#del-client').addEventListener('click', async () => {
              const ok = await confirmDialog(`Delete client "${c.name}"? This cannot be undone.`);
              if (ok) { await DB.delete('clients', c.id); closeModal(); toast('Client deleted'); render(root); }
            });
          },
        });
      });
    });
  }
  wire();

  root.querySelector('#add-client-fab').addEventListener('click', () => openClientForm(null, () => render(root)));
  root.querySelector('#search-clients').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = clients.filter((c) => c.name.toLowerCase().includes(q));
    root.querySelector('#clients-list').innerHTML = listHtml(filtered);
    wire();
  });
}

export default { render, pickClient };
