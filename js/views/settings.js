import { DB, seedCatalogIfEmpty, DEFAULT_SETTINGS } from '../db.js';
import { getSettings, refreshSettings, ensureWhiteLogoVariant } from '../app.js';
import { escapeHtml, fileToDataUrl, toast, shareOrDownload } from '../utils.js';
import { confirmDialog } from '../ui.js';

async function renderSettingsForm(root) {
  const s = getSettings();

  root.innerHTML = `
    <div class="section-title">Company Details</div>
    <div class="card">
      <div class="field"><label>Company Name</label><input id="f-companyName" value="${escapeHtml(s.companyName)}" /></div>
      <div class="field"><label>Tagline</label><input id="f-tagline" value="${escapeHtml(s.tagline)}" /></div>
      <div class="field"><label>Address</label><textarea id="f-address">${escapeHtml(s.address)}</textarea></div>
      <div class="field-row">
        <div class="field"><label>Phone</label><input id="f-phone" value="${escapeHtml(s.phone)}" /></div>
        <div class="field"><label>Phone (Alt)</label><input id="f-phone2" value="${escapeHtml(s.phone2 || '')}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Email</label><input id="f-email" value="${escapeHtml(s.email)}" /></div>
        <div class="field"><label>Website</label><input id="f-website" value="${escapeHtml(s.website)}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Registration No.</label><input id="f-regnum" value="${escapeHtml(s.registrationNumber)}" /></div>
        <div class="field"><label>VAT Number</label><input id="f-vatnum" value="${escapeHtml(s.vatNumber)}" placeholder="if VAT registered" /></div>
      </div>
    </div>

    <div class="section-title">Branding</div>
    <div class="card">
      <div class="field">
        <label>Logo</label><br/>
        ${s.logoDataUrl ? `<img src="${s.logoDataUrl}" class="logo-preview" />` : ''}
        <input type="file" id="f-logo" accept="image/*" />
        <p class="hint">Replace the placeholder logo with your real Alabama Electrical logo — this also updates the icon used across the app and on PDFs.</p>
      </div>
      <div class="field-row">
        <div class="field"><label>Primary Colour</label><div class="color-swatch-row"><input type="color" id="f-primary" value="${s.primaryColor}" /><span id="primary-hex" class="hint">${s.primaryColor}</span></div></div>
        <div class="field"><label>Accent Colour</label><div class="color-swatch-row"><input type="color" id="f-accent" value="${s.accentColor}" /><span id="accent-hex" class="hint">${s.accentColor}</span></div></div>
      </div>
    </div>

    <div class="section-title">Banking &amp; Payment Details</div>
    <div class="card">
      <div class="field"><label>Bank Name</label><input id="f-bankName" value="${escapeHtml(s.bankName)}" /></div>
      <div class="field-row">
        <div class="field"><label>Account Name</label><input id="f-accountName" value="${escapeHtml(s.accountName)}" /></div>
        <div class="field"><label>Account Number</label><input id="f-accountNumber" value="${escapeHtml(s.accountNumber)}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Branch</label><input id="f-branch" value="${escapeHtml(s.branch)}" /></div>
        <div class="field"><label>SWIFT</label><input id="f-swift" value="${escapeHtml(s.swift)}" /></div>
      </div>
      <div class="field"><label>EcoCash Number</label><input id="f-ecocash" value="${escapeHtml(s.ecocashNumber)}" /></div>
    </div>

    <div class="section-title">Currency</div>
    <div class="card">
      <div class="field"><label>Primary Currency</label>
        <select id="f-currency"><option value="USD" ${s.currency === 'USD' ? 'selected' : ''}>USD</option><option value="ZWG" ${s.currency === 'ZWG' ? 'selected' : ''}>ZWG</option></select>
      </div>
      <div class="checkbox-row"><input type="checkbox" id="f-enableSecondary" ${s.enableSecondaryCurrency ? 'checked' : ''} /><label for="f-enableSecondary" style="margin:0;">Show a converted amount in a second currency on documents</label></div>
      <div class="field-row">
        <div class="field"><label>Secondary Currency</label><input id="f-secondaryCurrency" value="${escapeHtml(s.secondaryCurrency)}" /></div>
        <div class="field"><label>Exchange Rate (1 ${escapeHtml(s.currency)} =)</label><input id="f-exchangeRate" type="number" min="0" step="0.0001" value="${s.exchangeRate}" /></div>
      </div>
    </div>

    <div class="section-title">VAT</div>
    <div class="card">
      <div class="checkbox-row"><input type="checkbox" id="f-vatEnabled" ${s.vatEnabled ? 'checked' : ''} /><label for="f-vatEnabled" style="margin:0;">Company is VAT registered — apply VAT to documents</label></div>
      <div class="field"><label>VAT Rate (%)</label><input id="f-vatRate" type="number" min="0" step="0.1" value="${s.vatRate}" /></div>
      <p class="hint">Leave this off until Alabama Electrical is registered for VAT. Turning it on will add VAT to every new quote, BOQ and invoice.</p>
    </div>

    <div class="section-title">Document Numbering</div>
    <div class="card">
      <div class="field-row">
        <div class="field"><label>Quote Prefix</label><input id="f-quotePrefix" value="${escapeHtml(s.quotePrefix)}" /></div>
        <div class="field"><label>Next Quote #</label><input id="f-nextQuoteNumber" type="number" min="1" value="${s.nextQuoteNumber}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Invoice Prefix</label><input id="f-invoicePrefix" value="${escapeHtml(s.invoicePrefix)}" /></div>
        <div class="field"><label>Next Invoice #</label><input id="f-nextInvoiceNumber" type="number" min="1" value="${s.nextInvoiceNumber}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>BOQ Prefix</label><input id="f-boqPrefix" value="${escapeHtml(s.boqPrefix)}" /></div>
        <div class="field"><label>Next BOQ #</label><input id="f-nextBoqNumber" type="number" min="1" value="${s.nextBoqNumber}" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Quote Validity (days)</label><input id="f-quoteValidityDays" type="number" min="1" value="${s.quoteValidityDays}" /></div>
        <div class="field"><label>Invoice Due (days)</label><input id="f-invoiceDueDays" type="number" min="1" value="${s.invoiceDueDays}" /></div>
      </div>
    </div>

    <div class="section-title">Default Document Text</div>
    <div class="card">
      <div class="field"><label>Quote Terms &amp; Conditions</label><textarea id="f-quoteTerms" style="min-height:110px;">${escapeHtml(s.quoteTerms)}</textarea></div>
      <div class="field"><label>Invoice Payment Instructions</label><textarea id="f-invoiceNotes" style="min-height:80px;">${escapeHtml(s.invoiceNotes)}</textarea></div>
    </div>

    <button class="btn btn-primary btn-block" id="save-settings" style="margin-top:4px;">Save Settings</button>
  `;

  document.getElementById('f-primary').addEventListener('input', (e) => { document.getElementById('primary-hex').textContent = e.target.value; });
  document.getElementById('f-accent').addEventListener('input', (e) => { document.getElementById('accent-hex').textContent = e.target.value; });

  let newLogoDataUrl = null;
  document.getElementById('f-logo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) newLogoDataUrl = await fileToDataUrl(file);
  });

  document.getElementById('save-settings').addEventListener('click', async () => {
    const updated = {
      ...s,
      companyName: val('f-companyName') || s.companyName,
      tagline: val('f-tagline'),
      address: val('f-address'),
      phone: val('f-phone'),
      phone2: val('f-phone2'),
      email: val('f-email'),
      website: val('f-website'),
      registrationNumber: val('f-regnum'),
      vatNumber: val('f-vatnum'),
      logoDataUrl: newLogoDataUrl || s.logoDataUrl,
      primaryColor: val('f-primary'),
      accentColor: val('f-accent'),
      bankName: val('f-bankName'),
      accountName: val('f-accountName'),
      accountNumber: val('f-accountNumber'),
      branch: val('f-branch'),
      swift: val('f-swift'),
      ecocashNumber: val('f-ecocash'),
      currency: val('f-currency'),
      enableSecondaryCurrency: document.getElementById('f-enableSecondary').checked,
      secondaryCurrency: val('f-secondaryCurrency'),
      exchangeRate: Number(val('f-exchangeRate') || 1),
      vatEnabled: document.getElementById('f-vatEnabled').checked,
      vatRate: Number(val('f-vatRate') || 0),
      quotePrefix: val('f-quotePrefix'),
      nextQuoteNumber: Number(val('f-nextQuoteNumber') || 1),
      invoicePrefix: val('f-invoicePrefix'),
      nextInvoiceNumber: Number(val('f-nextInvoiceNumber') || 1),
      boqPrefix: val('f-boqPrefix'),
      nextBoqNumber: Number(val('f-nextBoqNumber') || 1),
      quoteValidityDays: Number(val('f-quoteValidityDays') || 30),
      invoiceDueDays: Number(val('f-invoiceDueDays') || 14),
      quoteTerms: val('f-quoteTerms'),
      invoiceNotes: val('f-invoiceNotes'),
      updatedAt: new Date().toISOString(),
    };
    await DB.put('settings', updated);
    await refreshSettings();
    await ensureWhiteLogoVariant();
    toast('Settings saved', 'success');
    document.getElementById('page-title').textContent = updated.companyName;
    document.getElementById('page-subtitle').textContent = updated.tagline;
    const topLogo = document.querySelector('.topbar img.logo');
    if (updated.logoDataUrl && topLogo) topLogo.src = updated.logoDataUrl;
    renderSettingsForm(root);
  });

  function val(id) { return document.getElementById(id).value.trim(); }
}

async function renderBackup(root) {
  root.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;">Export Data</h3>
      <p class="hint">Save a backup file of all your clients, catalog, quotes, BOQs and invoices. Keep it somewhere safe (email to yourself, cloud drive, etc).</p>
      <button class="btn btn-primary btn-block" id="export-btn">⬇️ Export Backup (.json)</button>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">Restore Data</h3>
      <p class="hint">Importing a backup will replace all current data on this device with the contents of the file.</p>
      <input type="file" id="import-file" accept="application/json" />
    </div>
    <div class="card">
      <h3 style="margin-top:0;color:var(--color-danger);">Reset App</h3>
      <p class="hint">Erase all data on this device and start fresh with default settings and sample catalog items.</p>
      <button class="btn btn-danger-outline btn-block" id="reset-btn">Reset All Data</button>
    </div>
    <div class="card">
      <h3 style="margin-top:0;">About</h3>
      <p class="hint">Alabama Electrical — Quotes, Invoices &amp; BOQ app. Works fully offline; your data stays on this device only.</p>
    </div>
  `;

  document.getElementById('export-btn').addEventListener('click', async () => {
    const dump = await DB.exportAll();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    await shareOrDownload(blob, `alabama-electrical-backup-${new Date().toISOString().slice(0, 10)}.json`);
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = await confirmDialog('This will replace all current data with the backup file. Continue?', { confirmText: 'Import & Replace' });
    if (!ok) { e.target.value = ''; return; }
    try {
      const text = await file.text();
      const dump = JSON.parse(text);
      await DB.importAll(dump);
      await refreshSettings();
      toast('Backup restored', 'success');
      location.hash = '#/dashboard';
    } catch (err) {
      toast('Could not read that backup file', 'error');
    }
  });

  document.getElementById('reset-btn').addEventListener('click', async () => {
    const ok = await confirmDialog('This will permanently erase ALL data on this device. This cannot be undone.', { confirmText: 'Erase Everything' });
    if (!ok) return;
    for (const store of DB.STORES) await DB.clear(store);
    await DB.put('settings', { ...DEFAULT_SETTINGS });
    await seedCatalogIfEmpty();
    await refreshSettings();
    toast('App reset', 'success');
    location.hash = '#/dashboard';
  });
}

async function render(root, { mode }) {
  if (mode === 'backup') return renderBackup(root);
  return renderSettingsForm(root);
}

export default { render };
