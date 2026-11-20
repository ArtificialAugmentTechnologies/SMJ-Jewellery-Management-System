/**
 * CSV and PDF exports. PDFs use jsPDF's built-in Helvetica font, which has no
 * Tamil or ₹ glyphs, so PDF documents are always generated in English with "Rs.".
 */
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Invoice } from './types';
import { formatAmount, formatDate, formatDateTime, num } from './format';
import { STORE } from './store';

const GOLD: [number, number, number] = [184, 137, 47];
const DARK: [number, number, number] = [42, 34, 22];

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  // BOM so Excel opens UTF-8 (Tamil names) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawLogo(doc: jsPDF, x: number, y: number, r: number) {
  doc.setFillColor(...GOLD);
  doc.circle(x, y, r, 'F');
  doc.setDrawColor(255, 248, 230);
  doc.setLineWidth(0.4);
  doc.circle(x, y, r - 1.2, 'S');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(r * 1.25);
  doc.text('SMJ', x, y + r * 0.22, { align: 'center' });
}

function header(doc: jsPDF, title: string, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();
  drawLogo(doc, 22, 20, 8);
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(STORE.name, 34, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(110, 100, 80);
  const contact = [STORE.address, STORE.phone && `Ph: ${STORE.phone}`, STORE.email, STORE.gstin && `GSTIN: ${STORE.gstin}`]
    .filter(Boolean)
    .join('  |  ');
  if (contact) doc.text(doc.splitTextToSize(contact, w - 110), 34, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...GOLD);
  doc.text(title, w - 14, 18, { align: 'right' });
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 100, 80);
    doc.text(subtitle, w - 14, 23, { align: 'right' });
  }
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(14, 31, w - 14, 31);
}

const rs = (v: unknown) => `Rs. ${formatAmount(v)}`;

export function buildInvoicePdf(inv: Invoice) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  header(doc, inv.invoiceType === 'retail' ? 'INVOICE' : 'WHOLESALE INVOICE');

  const owner = inv.customer ?? inv.party;
  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('BILLED TO', 14, 39);
  doc.text('INVOICE DETAILS', w / 2 + 10, 39);
  doc.setFont('helvetica', 'normal');
  const ownerLines = [
    owner?.name ?? '',
    owner ? `Mobile: ${owner.mobileNumber}` : '',
    owner?.email ?? '',
    inv.party?.address ?? '',
  ].filter(Boolean);
  doc.text(ownerLines, 14, 44);
  const detailLines = [
    `Invoice No: ${inv.invoiceNumber}`,
    `Date: ${formatDateTime(inv.invoiceDate)}`,
    `Payment Status: ${inv.paymentStatus.toUpperCase()}`,
    `Gold Rate: Rs. ${formatAmount(inv.goldRatePerGram)}/g   Silver: Rs. ${formatAmount(inv.silverRatePerGram)}/g`,
  ];
  doc.text(detailLines, w / 2 + 10, 44);

  autoTable(doc, {
    startY: 64,
    head: [['#', 'Product', 'Category', 'Weight (g)', 'Qty', 'Rate/g', 'Gold Amount', 'Making', 'Discount', 'Total']],
    body: inv.items.map((it, i) => [
      i + 1,
      it.productName + (it.description ? `\n${it.description}` : ''),
      `${it.category}${it.metal === 'silver' ? ' (Silver)' : ''}`,
      num(it.weight).toFixed(3),
      it.quantity,
      formatAmount(it.goldRate),
      formatAmount(it.goldAmount),
      formatAmount(it.makingCharges),
      formatAmount(it.discount),
      formatAmount(it.totalAmount),
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.8, textColor: DARK, lineColor: [233, 224, 203] },
    headStyles: { fillColor: GOLD, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 7 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const totalsTop = y;
  const rows: [string, string][] = [
    ['Total Weight', `${num(inv.totalWeight).toFixed(3)} g`],
    ['Gold Amount', rs(inv.goldAmount)],
    ['Making Charges', rs(inv.makingCharges)],
    ['Subtotal', rs(inv.subtotal)],
    ['Item Discounts', `- ${rs(inv.itemDiscount)}`],
    ['Invoice Discount', `- ${rs(inv.overallDiscount)}`],
  ];
  if (num(inv.gstAmount) > 0) {
    const half = num(inv.gstRate) / 2;
    const c = Math.round(num(inv.gstAmount) * 100);
    const cg = (c - Math.floor(c / 2)) / 100;
    rows.push(['Taxable Value', rs(num(inv.subtotal) - num(inv.discount))]);
    rows.push([`CGST @ ${half}%`, rs(cg)]);
    rows.push([`SGST @ ${half}%`, rs(num(inv.gstAmount) - cg)]);
  }
  doc.setFontSize(9);
  for (const [k, v] of rows) {
    doc.setTextColor(110, 100, 80);
    doc.text(k, w - 80, y);
    doc.setTextColor(...DARK);
    doc.text(v, w - 14, y, { align: 'right' });
    y += 5.5;
  }
  doc.setDrawColor(...GOLD);
  doc.line(w - 80, y - 2, w - 14, y - 2);
  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text('Grand Total', w - 80, y);
  doc.text(rs(inv.grandTotal), w - 14, y, { align: 'right' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Paid: ${rs(inv.amountPaid)}`, w - 80, y);
  doc.text(`Balance: ${rs(num(inv.grandTotal) - num(inv.amountPaid))}`, w - 14, y, { align: 'right' });

  if (inv.notes) {
    doc.setFontSize(8.5);
    doc.setTextColor(110, 100, 80);
    doc.text(doc.splitTextToSize(`Notes: ${inv.notes}`, 95), 14, totalsTop);
  }

  const bottom = doc.internal.pageSize.getHeight() - 22;
  doc.setDrawColor(200, 190, 170);
  doc.line(14, bottom, 70, bottom);
  doc.line(w - 70, bottom, w - 14, bottom);
  doc.setFontSize(8.5);
  doc.setTextColor(110, 100, 80);
  doc.text('Customer Signature', 14, bottom + 5);
  doc.text('Authorised Signatory', w - 14, bottom + 5, { align: 'right' });
  doc.setTextColor(...GOLD);
  doc.text(`Thank you for shopping with ${STORE.name}!`, w / 2, bottom + 13, { align: 'center' });
  if (inv.createdByName) {
    doc.setTextColor(150, 140, 120);
    doc.text(`Prepared by ${inv.createdByName}`, 14, bottom - 4);
  }
  return doc;
}

export function downloadInvoicePdf(inv: Invoice) {
  buildInvoicePdf(inv).save(`${inv.invoiceNumber}.pdf`);
}

export function downloadTablePdf(opts: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  filename: string;
  numericColumns?: number[];
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: opts.headers.length > 7 ? 'landscape' : 'portrait' });
  header(doc, opts.title.toUpperCase(), opts.subtitle ?? `Generated ${formatDate(new Date())}`);
  const columnStyles: Record<number, { halign: 'right' }> = {};
  for (const i of opts.numericColumns ?? []) columnStyles[i] = { halign: 'right' };
  autoTable(doc, {
    startY: 36,
    head: [opts.headers],
    body: opts.rows,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.6, textColor: DARK },
    headStyles: { fillColor: GOLD, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [252, 248, 238] },
    columnStyles,
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150, 140, 120);
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    },
  });
  doc.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
}
