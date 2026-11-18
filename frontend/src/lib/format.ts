import type { Lang } from '../i18n';

/** Accepts ISO strings, PostgreSQL timestamp text ("2026-11-18 10:00:00.12+00") and Dates. */
export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  let s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2} \d/.test(s)) s = s.replace(' ', 'T');
  s = s.replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const locale = (lang: Lang) => (lang === 'ta' ? 'ta-IN' : 'en-IN');
const TZ = 'Asia/Kolkata';

export function formatDate(value: unknown, lang: Lang = 'en') {
  const d = parseDate(value);
  return d ? d.toLocaleDateString(locale(lang), { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }) : '—';
}

export function formatDateTime(value: unknown, lang: Lang = 'en') {
  const d = parseDate(value);
  return d
    ? d.toLocaleString(locale(lang), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TZ,
      })
    : '—';
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const inrPlain = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const formatMoney = (v: unknown) => inr.format(num(v));
/** Money without the ₹ symbol (used in PDFs, whose built-in fonts lack the glyph). */
export const formatAmount = (v: unknown) => inrPlain.format(num(v));
export const formatWeight = (v: unknown) => `${num(v).toFixed(3)} g`;
export const formatInt = (v: unknown) => new Intl.NumberFormat('en-IN').format(num(v));

/** yyyy-mm-dd in local time, for <input type="date">. */
export function toDateInput(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toDateTimeInput(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converts a local yyyy-mm-dd to an ISO instant at local midnight (optionally + days). */
export function dateInputToIso(value: string, addDays = 0) {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + addDays).toISOString();
}

export function digitsOnly(value: string, max = 10) {
  return value.replace(/\D/g, '').slice(0, max);
}
