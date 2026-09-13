// utils.js — shared formatting & helper functions

export function uid() {
  return crypto.randomUUID();
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function money(amount, currency = 'USD') {
  const n = Number(amount || 0);
  const symbols = { USD: '$', ZWG: 'ZWG ' };
  const symbol = symbols[currency] || currency + ' ';
  return symbol + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function convert(amountUSD, settings) {
  if (!settings.enableSecondaryCurrency) return null;
  const rate = Number(settings.exchangeRate || 1);
  return Number(amountUSD || 0) * rate;
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function calcTotals(items, vatEnabled, vatRate) {
  const subtotal = items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.unitPrice || 0), 0);
  const vatAmount = vatEnabled ? subtotal * (Number(vatRate || 0) / 100) : 0;
  const total = subtotal + vatAmount;
  return { subtotal, vatAmount, total };
}

export function nextDocNumber(prefix, counter) {
  return `${prefix}${String(counter).padStart(4, '0')}`;
}

// Strips characters that are unsafe in a filename on Windows/macOS/Android and tidies whitespace.
export function safeFilenamePart(str) {
  return String(str ?? '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Default PDF download/share filename: "<Client Name> - <Doc Number>.pdf"
export function pdfFilename(name, docNumber) {
  const namePart = safeFilenamePart(name) || 'Client';
  const numberPart = safeFilenamePart(docNumber) || 'Document';
  return `${namePart} - ${numberPart}.pdf`;
}

export function toast(msg, type = 'info') {
  const el = document.getElementById('toast-root');
  if (!el) return;
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.textContent = msg;
  el.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 2600);
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Turns any logo (colour, on transparency) into a solid-white silhouette with the same
// shape/alpha — used to keep the logo legible when placed on a dark/brand-colour background
// (the PDF header bar, app icons). Works for whatever logo the admin has uploaded.
export function makeWhiteSilhouetteDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) { resolve(''); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 0) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function shareOrDownload(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function statusBadge(status) {
  const map = {
    draft: 'badge-gray',
    sent: 'badge-blue',
    accepted: 'badge-green',
    declined: 'badge-red',
    expired: 'badge-orange',
    final: 'badge-blue',
    converted: 'badge-green',
    invoiced: 'badge-green',
    unpaid: 'badge-red',
    partial: 'badge-orange',
    paid: 'badge-green',
    overdue: 'badge-red',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${escapeHtml(status)}</span>`;
}

export function paymentStatus(docTotal, receivedTotal) {
  if (receivedTotal <= 0) return 'unpaid';
  if (receivedTotal >= docTotal - 0.005) return 'paid';
  return 'partial';
}

// True when an invoice's due date has passed and it is not yet fully paid.
export function isOverdue(invoice, receivedTotal) {
  if (!invoice || !invoice.dueDate) return false;
  if (receivedTotal >= Number(invoice.total || 0) - 0.005) return false;
  const due = new Date(invoice.dueDate);
  const today = new Date(todayISO());
  return due < today;
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
