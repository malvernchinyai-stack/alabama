// pdf.js — branded PDF generation for Quotes, BOQs, Invoices and Payment Receipts using jsPDF (vendored, offline).
import { money, fmtDate, convert } from './utils.js';

function getJsPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('PDF library not loaded yet. Please try again.');
  }
  return window.jspdf.jsPDF;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function drawHeader(doc, settings, docTitle, meta) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const [pr, pg, pb] = hexToRgb(settings.primaryColor || '#0A2463');
  const [ar, ag, ab] = hexToRgb(settings.accentColor || '#F2A93B');

  // top accent bar
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(ar, ag, ab);
  doc.rect(0, 26, pageWidth, 2, 'F');

  // logo — use the white silhouette variant so it stays legible on this navy bar
  const headerLogo = settings.logoWhiteDataUrl || settings.logoDataUrl;
  if (headerLogo) {
    try {
      const imgProps = doc.getImageProperties(headerLogo);
      const maxW = 46, maxH = 16;
      let w = maxW, h = (imgProps.height / imgProps.width) * w;
      if (h > maxH) { h = maxH; w = (imgProps.width / imgProps.height) * h; }
      doc.addImage(headerLogo, 'PNG', 12, (26 - h) / 2, w, h);
    } catch (e) { /* ignore bad image */ }
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(settings.companyName || 'ALABAMA ELECTRICAL', 12, 16);
  }

  // doc title top-right
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(docTitle, pageWidth - 12, 16, { align: 'right' });

  // company block
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  let y = 34;
  const lines = [
    settings.companyName,
    settings.address,
    [settings.phone, settings.phone2].filter(Boolean).join('  /  '),
    [settings.email, settings.website].filter(Boolean).join('  |  '),
    settings.vatNumber ? `VAT No: ${settings.vatNumber}` : '',
  ].filter(Boolean);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(lines[0] || '', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  lines.slice(1).forEach((l, i) => doc.text(l, 12, y + 5 + i * 4.2));

  // meta block top-right (doc number/date etc.)
  doc.setFontSize(8.5);
  let my = y;
  meta.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, pageWidth - 70, my);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value ?? ''), pageWidth - 12, my, { align: 'right' });
    my += 5;
  });

  return Math.max(y + 5 + lines.length * 4.2, my) + 4;
}

function drawClientBlock(doc, startY, title, client) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(title, 12, startY);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  let y = startY + 5;
  const rows = [client.name, client.contactPerson, client.address, [client.phone, client.email].filter(Boolean).join('  |  ')].filter(Boolean);
  rows.forEach((r) => { doc.text(String(r), 12, y); y += 4.6; });
  return y + 2;
}

function drawItemsTable(doc, startY, items, settings, opts = {}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const colUnitX = pageWidth - 92;
  const colQtyX = pageWidth - 68;
  const colPriceX = pageWidth - 48;
  const colTotalX = pageWidth - 12;
  let y = startY;

  function header() {
    doc.setFillColor(240, 242, 247);
    doc.rect(marginX, y - 5, pageWidth - marginX * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(opts.descLabel || 'Description', marginX + 2, y);
    doc.text('Unit', colUnitX, y, { align: 'right' });
    doc.text('Qty', colQtyX, y, { align: 'right' });
    doc.text('Unit Price', colPriceX, y, { align: 'right' });
    doc.text('Amount', colTotalX, y, { align: 'right' });
    y += 6;
  }

  header();
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);

  let currentCategory = null;
  items.forEach((it) => {
    if (y > pageHeight - 45) {
      doc.addPage();
      y = 20;
      header();
    }
    if (opts.groupByCategory && it.category && it.category !== currentCategory) {
      currentCategory = it.category;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(10, 36, 99);
      doc.text(currentCategory, marginX + 2, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 30, 30);
      y += 5;
    }
    const lineTotal = Number(it.qty || 0) * Number(it.unitPrice || 0);
    const descLines = doc.splitTextToSize(it.description || '', colUnitX - marginX - 6);
    doc.text(descLines, marginX + 2, y);
    doc.text(String(it.unit || ''), colUnitX, y, { align: 'right' });
    doc.text(String(it.qty ?? ''), colQtyX, y, { align: 'right' });
    doc.text(money(it.unitPrice, settings.currency), colPriceX, y, { align: 'right' });
    doc.text(money(lineTotal, settings.currency), colTotalX, y, { align: 'right' });
    y += Math.max(5.5, descLines.length * 4.2 + 1.5);
    doc.setDrawColor(230, 230, 230);
    doc.line(marginX, y - 3, pageWidth - marginX, y - 3);
  });

  return y + 2;
}

function drawTotals(doc, startY, totals, settings) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const labelX = pageWidth - 68;
  const valueX = pageWidth - 12;
  let y = startY + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(50, 50, 50);

  doc.text('Subtotal', labelX, y, { align: 'right' });
  doc.text(money(totals.subtotal, settings.currency), valueX, y, { align: 'right' });
  y += 5.5;

  if (settings.vatEnabled) {
    doc.text(`VAT (${settings.vatRate}%)`, labelX, y, { align: 'right' });
    doc.text(money(totals.vatAmount, settings.currency), valueX, y, { align: 'right' });
    y += 5.5;
  }

  doc.setDrawColor(180, 180, 180);
  doc.line(labelX - 30, y - 3.5, valueX, y - 3.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const [pr, pg, pb] = hexToRgb(settings.primaryColor || '#0A2463');
  doc.setTextColor(pr, pg, pb);
  doc.text('TOTAL', labelX, y + 1, { align: 'right' });
  doc.text(money(totals.total, settings.currency), valueX, y + 1, { align: 'right' });
  y += 7;

  if (settings.enableSecondaryCurrency) {
    const conv = convert(totals.total, settings);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    doc.text(`(approx. ${money(conv, settings.secondaryCurrency)} @ rate ${settings.exchangeRate})`, valueX, y, { align: 'right' });
    y += 5;
  }

  return y + 2;
}

function drawFooterNotes(doc, startY, title, text, settings, extra) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = startY + 6;
  if (y > pageHeight - 40) { doc.addPage(); y = 20; }

  if (extra && extra.bank) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text('Payment Details', 12, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    y += 5;
    const b = extra.bank;
    const bankLines = [
      b.bankName ? `Bank: ${b.bankName}` : '',
      b.accountName ? `Account Name: ${b.accountName}` : '',
      b.accountNumber ? `Account No: ${b.accountNumber}` : '',
      b.branch ? `Branch: ${b.branch}` : '',
      b.swift ? `SWIFT: ${b.swift}` : '',
      b.ecocashNumber ? `EcoCash: ${b.ecocashNumber}` : '',
    ].filter(Boolean);
    bankLines.forEach((l) => { doc.text(l, 12, y); y += 4.2; });
    y += 3;
  }

  if (text) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(title, 12, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    const split = doc.splitTextToSize(text, pageWidth - 24);
    doc.text(split, 12, y);
    y += split.length * 4;
  }

  return y;
}

function drawPageFooter(doc, settings) {
  const pageCount = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220, 220, 220);
    doc.line(12, pageHeight - 14, pageWidth - 12, pageHeight - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(settings.companyName || '', 12, pageHeight - 9);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 12, pageHeight - 9, { align: 'right' });
  }
}

export function buildQuotePDF(quote, settings) {
  const jsPDF = getJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const meta = [
    ['Quote No', quote.quoteNumber],
    ['Date', fmtDate(quote.date)],
    ['Valid Until', fmtDate(quote.validUntil)],
  ];
  let y = drawHeader(doc, settings, 'QUOTATION', meta);
  y = drawClientBlock(doc, y, 'Quoted To', quote.client || {});
  if (quote.projectTitle) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
    doc.text(`Project: ${quote.projectTitle}`, 12, y); y += 6;
  }
  y = drawItemsTable(doc, y + 2, quote.items, settings, { groupByCategory: true });
  y = drawTotals(doc, y, { subtotal: quote.subtotal, vatAmount: quote.vatAmount, total: quote.total }, settings);
  drawFooterNotes(doc, y, 'Terms & Conditions', quote.terms || settings.quoteTerms, settings, { bank: settings });
  drawPageFooter(doc, settings);
  return doc;
}

export function buildBoqPDF(boq, settings) {
  const jsPDF = getJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const meta = [
    ['BOQ No', boq.boqNumber],
    ['Date', fmtDate(boq.date)],
  ];
  let y = drawHeader(doc, settings, 'BILL OF QUANTITIES', meta);
  if (boq.client && boq.client.name) {
    y = drawClientBlock(doc, y, 'Prepared For', boq.client);
  }
  if (boq.projectLocation || boq.title) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
    if (boq.title) { doc.text(`Project: ${boq.title}`, 12, y); y += 5; }
    if (boq.projectLocation) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Location: ${boq.projectLocation}`, 12, y); y += 6; }
  }
  y = drawItemsTable(doc, y + 2, boq.items, settings, { groupByCategory: true, descLabel: 'Item Description' });
  y = drawTotals(doc, y, { subtotal: boq.subtotal, vatAmount: boq.vatAmount, total: boq.total }, settings);
  drawFooterNotes(doc, y, 'Notes', boq.notes || '', settings, {});
  drawPageFooter(doc, settings);
  return doc;
}

export function buildInvoicePDF(invoice, settings) {
  const jsPDF = getJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const received = (invoice.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, invoice.total - received);
  const meta = [
    ['Invoice No', invoice.invoiceNumber],
    ['Date', fmtDate(invoice.date)],
    ['Due Date', fmtDate(invoice.dueDate)],
  ];
  let y = drawHeader(doc, settings, 'INVOICE', meta);
  y = drawClientBlock(doc, y, 'Billed To', invoice.client || {});
  if (invoice.projectTitle) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30,30,30);
    doc.text(`Project: ${invoice.projectTitle}`, 12, y); y += 6;
  }
  y = drawItemsTable(doc, y + 2, invoice.items, settings, { groupByCategory: true });
  y = drawTotals(doc, y, { subtotal: invoice.subtotal, vatAmount: invoice.vatAmount, total: invoice.total }, settings);

  // Amount paid / balance due block
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(50, 50, 50);
  const pageWidth = doc.internal.pageSize.getWidth();
  const labelX = pageWidth - 68, valueX = pageWidth - 12;
  doc.text('Amount Paid', labelX, y, { align: 'right' });
  doc.text(money(received, settings.currency), valueX, y, { align: 'right' });
  y += 5.5;
  doc.setFont('helvetica', 'bold');
  const [pr, pg, pb] = hexToRgb(settings.primaryColor || '#0A2463');
  doc.setTextColor(pr, pg, pb);
  doc.text('BALANCE DUE', labelX, y, { align: 'right' });
  doc.text(money(balance, settings.currency), valueX, y, { align: 'right' });
  y += 6;

  drawFooterNotes(doc, y, 'Payment Instructions', invoice.notes || settings.invoiceNotes, settings, { bank: settings });
  drawPageFooter(doc, settings);
  return doc;
}

export function buildPaymentReceiptPDF(invoice, payment, paymentIndex, settings) {
  const jsPDF = getJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const payments = invoice.payments || [];
  const previouslyReceived = payments.slice(0, paymentIndex).reduce((s, p) => s + Number(p.amount || 0), 0);
  const balanceAfter = Math.max(0, invoice.total - previouslyReceived - Number(payment.amount || 0));

  const meta = [
    ['Receipt No', `${invoice.invoiceNumber}-R${paymentIndex + 1}`],
    ['Date', fmtDate(payment.date)],
    ['Payment Method', payment.method],
  ];
  let y = drawHeader(doc, settings, 'RECEIPT', meta);
  y = drawClientBlock(doc, y, 'Received From', invoice.client || {});

  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  doc.text(`Against Invoice: ${invoice.invoiceNumber}`, 12, y); y += 8;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  const rows = [
    ['Invoice Total', money(invoice.total, settings.currency)],
    ['Previously Received', money(previouslyReceived, settings.currency)],
    ['This Payment', money(payment.amount, settings.currency)],
    ['Balance Remaining', money(balanceAfter, settings.currency)],
  ];
  rows.forEach(([label, val]) => {
    doc.text(label, 12, y);
    doc.text(val, 80, y);
    y += 5;
  });
  y += 4;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  const [pr, pg, pb] = hexToRgb(settings.primaryColor || '#0A2463');
  doc.setTextColor(pr, pg, pb);
  doc.text(`Amount Received: ${money(payment.amount, settings.currency)}`, 12, y + 2);
  y += 10;

  if (payment.notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 90, 90);
    doc.text(doc.splitTextToSize(payment.notes, 180), 12, y);
    y += 8;
  }

  drawFooterNotes(doc, y, 'Thank You', 'Thank you for your business.', settings, {});
  drawPageFooter(doc, settings);
  return doc;
}
