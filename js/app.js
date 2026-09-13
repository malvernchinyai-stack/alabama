// app.js — app shell, router, theme, install prompt, service worker registration.
import { DB, ensureSettings, seedCatalogIfEmpty } from './db.js';
import { toast, blobToDataUrl, makeWhiteSilhouetteDataUrl } from './utils.js';
import { openModal, closeModal } from './ui.js';

import dashboardView from './views/dashboard.js';
import quotesView from './views/quotes.js';
import boqView from './views/boq.js';
import invoicesView from './views/invoices.js';
import clientsView from './views/clients.js';
import catalogView from './views/catalog.js';
import settingsView from './views/settings.js';

let currentSettings = null;
let deferredInstallPrompt = null;

export function getSettings() { return currentSettings; }
export async function refreshSettings() {
  currentSettings = await ensureSettings();
  applyTheme(currentSettings);
  return currentSettings;
}

function applyTheme(settings) {
  document.documentElement.style.setProperty('--color-primary', settings.primaryColor || '#002760');
  document.documentElement.style.setProperty('--color-accent', settings.accentColor || '#F2A93B');
  // derive a lighter shade for gradients
  document.documentElement.style.setProperty('--color-primary-light', lighten(settings.primaryColor || '#002760', 28));
}

function lighten(hex, amt) {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  let r = (num >> 16) + amt, g = ((num >> 8) & 0xff) + amt, b = (num & 0xff) + amt;
  r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Home', icon: '🏠' },
  { key: 'quotes', label: 'Quotes', icon: '📄' },
  { key: 'invoices', label: 'Invoices', icon: '🧾' },
  { key: 'boq', label: 'BOQ', icon: '🧱' },
  { key: 'more', label: 'More', icon: '⋯' },
];

function shellHtml() {
  const s = currentSettings || {};
  return `
    <div id="toast-root"></div>
    <header class="topbar" id="topbar">
      <button class="back-btn" id="back-btn" style="display:none;" aria-label="Back">←</button>
      ${s.logoDataUrl ? `<div class="logo-badge"><img class="logo" src="${s.logoDataUrl}" alt="logo"/></div>` : ''}
      <div class="titles">
        <h1 id="page-title">${s.companyName || 'Alabama Electrical'}</h1>
        <small id="page-subtitle">${s.tagline || ''}</small>
      </div>
      <button class="icon-btn" id="sync-btn" title="Refresh">⟳</button>
    </header>
    <main class="content" id="content"></main>
    <nav class="bottom-nav" id="bottom-nav">
      ${NAV_ITEMS.map((n) => `
        <button class="nav-item" data-nav="${n.key}">
          <span class="nav-icon">${n.icon}</span>
          <span>${n.label}</span>
        </button>`).join('')}
    </nav>
  `;
}

function setActiveNav(section) {
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === section);
  });
}

function setTitle(title, subtitle, showBack) {
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = subtitle || '';
  document.getElementById('back-btn').style.display = showBack ? 'block' : 'none';
}

function openMoreSheet() {
  openModal({
    id: 'more-sheet',
    title: 'More',
    bodyHtml: `
      <div class="list-item" data-go="#/clients"><div class="li-icon">👥</div><div class="li-main"><div class="li-title">Clients</div><div class="li-sub">Manage customer contacts</div></div></div>
      <div class="list-item" data-go="#/catalog"><div class="li-icon">📦</div><div class="li-main"><div class="li-title">Item &amp; Price Catalog</div><div class="li-sub">Panels, inverters, batteries, electrical installs, labour…</div></div></div>
      <div class="list-item" data-go="#/settings"><div class="li-icon">⚙️</div><div class="li-main"><div class="li-title">Settings</div><div class="li-sub">Company details, branding, VAT, currency</div></div></div>
      <div class="list-item" data-go="#/backup"><div class="li-icon">💾</div><div class="li-main"><div class="li-title">Backup &amp; Restore</div><div class="li-sub">Export or import your data as a file</div></div></div>
    `,
    onMount: (el) => {
      el.querySelectorAll('[data-go]').forEach((row) => {
        row.addEventListener('click', () => { closeModal(); location.hash = row.dataset.go; });
      });
    },
  });
}

async function router() {
  const hashRaw = location.hash.replace(/^#\/?/, '');
  const hash = hashRaw.split('?')[0];
  const parts = hash.split('/').filter(Boolean);
  const content = document.getElementById('content');
  const section = parts[0] || 'dashboard';

  if (section === 'more') {
    openMoreSheet();
    setActiveNav('more');
    history.back();
    return;
  }
  setActiveNav(['dashboard', 'quotes', 'invoices', 'boq'].includes(section) ? section : '');

  try {
    if (!section || section === 'dashboard') {
      setTitle(currentSettings.companyName, currentSettings.tagline, false);
      await dashboardView.render(content, {});
    } else if (section === 'quotes') {
      await routeDocSection(quotesView, 'Quotes', parts, content);
    } else if (section === 'boq') {
      await routeDocSection(boqView, 'Bill of Quantities', parts, content);
    } else if (section === 'invoices') {
      await routeDocSection(invoicesView, 'Invoices', parts, content);
    } else if (section === 'clients') {
      setTitle('Clients', 'Customer directory', true);
      await clientsView.render(content, { id: parts[1] });
    } else if (section === 'catalog') {
      setTitle('Catalog', 'Items &amp; pricing', true);
      await catalogView.render(content, {});
    } else if (section === 'settings') {
      setTitle('Settings', 'Company & app configuration', true);
      await settingsView.render(content, { mode: 'settings' });
    } else if (section === 'backup') {
      setTitle('Backup & Restore', 'Keep your data safe', true);
      await settingsView.render(content, { mode: 'backup' });
    } else {
      setTitle('Not found', '', true);
      content.innerHTML = '<div class="empty-state"><div class="emoji">🤔</div>Page not found.</div>';
    }
  } catch (err) {
    console.error(err);
    content.innerHTML = `<div class="empty-state"><div class="emoji">⚠️</div>Something went wrong loading this page.<br><small>${(err && err.message) || err}</small></div>`;
  }
}

async function routeDocSection(view, label, parts, content) {
  const sub = parts[1];
  if (!sub) {
    setTitle(label, view.listSubtitle || '', false);
    await view.render(content, { action: 'list' });
  } else if (sub === 'new') {
    setTitle(`New ${view.singular}`, '', true);
    await view.render(content, { action: 'new', query: parseQuery() });
  } else if (parts[2] === 'edit') {
    setTitle(`Edit ${view.singular}`, '', true);
    await view.render(content, { action: 'edit', id: sub });
  } else {
    setTitle(view.singular, '', true);
    await view.render(content, { action: 'view', id: sub });
  }
}

function parseQuery() {
  const q = location.hash.split('?')[1];
  const out = {};
  if (q) new URLSearchParams(q).forEach((v, k) => { out[k] = v; });
  return out;
}

function wireNav() {
  document.getElementById('bottom-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item');
    if (!btn) return;
    if (btn.dataset.nav === 'more') { openMoreSheet(); return; }
    location.hash = `#/${btn.dataset.nav}`;
  });
  document.getElementById('back-btn').addEventListener('click', () => history.back());
  document.getElementById('sync-btn').addEventListener('click', async () => {
    await router();
    toast('Refreshed');
  });
}

function wireInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const b = document.getElementById('install-banner');
    if (b) b.remove();
  });
}

function showInstallBanner() {
  if (document.getElementById('install-banner')) return;
  const content = document.getElementById('content');
  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.id = 'install-banner';
  banner.innerHTML = `<span>📲 Install this app on your device for offline use.</span><button class="btn btn-primary btn-sm" id="do-install">Install</button>`;
  content.prepend(banner);
  banner.querySelector('#do-install').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    banner.remove();
  });
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./service-worker.js');
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  }
}

function wireOnlineIndicator() {
  const render = () => {
    let pill = document.getElementById('offline-pill');
    if (!navigator.onLine) {
      if (!pill) {
        pill = document.createElement('div');
        pill.id = 'offline-pill';
        pill.className = 'offline-pill';
        pill.textContent = '⚡ Offline mode';
        document.body.appendChild(pill);
      }
    } else if (pill) {
      pill.remove();
    }
  };
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
}

async function seedDefaultLogoIfMissing() {
  if (!currentSettings.logoDataUrl) {
    try {
      const res = await fetch('./assets/logo.png');
      if (res.ok) {
        const blob = await res.blob();
        currentSettings.logoDataUrl = await blobToDataUrl(blob);
      }
    } catch (e) {
      console.warn('Could not preload default logo', e);
    }
  }
  await ensureWhiteLogoVariant();
}

// Keeps a white-silhouette copy of the current logo ready (for the PDF header bar and any
// other dark-background spot), regenerating it whenever the logo itself has changed.
export async function ensureWhiteLogoVariant() {
  if (!currentSettings.logoDataUrl) return;
  if (currentSettings.logoWhiteDataUrl && currentSettings._logoWhiteSourceLen === currentSettings.logoDataUrl.length) return;
  try {
    currentSettings.logoWhiteDataUrl = await makeWhiteSilhouetteDataUrl(currentSettings.logoDataUrl);
    currentSettings._logoWhiteSourceLen = currentSettings.logoDataUrl.length;
    await DB.put('settings', currentSettings);
  } catch (e) {
    console.warn('Could not generate white logo variant', e);
  }
}

async function main() {
  document.getElementById('app').innerHTML = '<div class="empty-state">Loading…</div>';
  await refreshSettings();
  await seedDefaultLogoIfMissing();
  await seedCatalogIfEmpty();
  document.getElementById('app').innerHTML = shellHtml();
  wireNav();
  wireInstallPrompt();
  wireOnlineIndicator();
  window.addEventListener('hashchange', router);
  await router();
  registerServiceWorker();
}

main();
