/**
 * Exact billing arithmetic (mirrors backend/src/utils/money.ts) so the preview
 * shown while billing matches the amounts the server saves.
 */
function toScaled(value: string | number, scale: number): bigint {
  const str = typeof value === 'number' ? value.toFixed(scale + 2) : String(value ?? '').trim() || '0';
  if (!/^-?\d+(\.\d+)?$/.test(str)) return 0n;
  const negative = str.startsWith('-');
  const [intPart, fracPart = ''] = str.replace('-', '').split('.');
  const kept = (fracPart + '0'.repeat(scale)).slice(0, scale);
  const nextDigit = Number(fracPart[scale] ?? '0');
  let result = BigInt(intPart) * 10n ** BigInt(scale) + BigInt(kept || '0');
  if (nextDigit >= 5) result += 1n;
  return negative ? -result : result;
}

export const toPaise = (v: string | number) => toScaled(v, 2);
export const toMg = (v: string | number) => toScaled(v, 3);
export const paiseToNumber = (p: bigint) => Number(p) / 100;

/** Exact paise -> "1234.50" string for sending to the API. */
export function paiseToString(p: bigint) {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  return `${neg ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

export type DiscountMode = 'percent' | 'amount';

/**
 * Discount in paise. In "percent" mode `value` is a percentage of `base`
 * (e.g. "10" = 10 %), rounded half-up to the nearest paisa.
 */
export function discountPaise(base: bigint, value: string, mode: DiscountMode) {
  if (mode === 'amount') return toPaise(value || '0');
  const pctX100 = toPaise(value || '0'); // 10 % -> 1000
  if (base <= 0n || pctX100 <= 0n) return 0n;
  return (base * pctX100 * 2n + 10000n) / 20000n;
}
export const mgToNumber = (mg: bigint) => Number(mg) / 1000;

export interface DraftLine {
  weight: string;
  quantity: string | number;
  rate: string | number;
  making_charges: string;
  discount: string;
}

export function calcLine(l: DraftLine) {
  const weightMg = toMg(l.weight);
  const qty = BigInt(Math.max(0, Math.trunc(Number(l.quantity) || 0)));
  const rate = toPaise(l.rate);
  const goldAmount = (weightMg * rate * qty * 2n + 1000n) / 2000n;
  const making = toPaise(l.making_charges || '0');
  const discount = toPaise(l.discount || '0');
  const subtotal = goldAmount + making;
  return { weightMg: weightMg * qty, goldAmount, making, discount, subtotal, total: subtotal - discount };
}

export function calcTotals(lines: DraftLine[], overallDiscount: string) {
  const calcs = lines.map(calcLine);
  const sum = (f: (c: ReturnType<typeof calcLine>) => bigint) => calcs.reduce((a, c) => a + f(c), 0n);
  const goldAmount = sum((c) => c.goldAmount);
  const making = sum((c) => c.making);
  const itemDiscount = sum((c) => c.discount);
  const overall = toPaise(overallDiscount || '0');
  const subtotal = goldAmount + making;
  const discount = itemDiscount + overall;
  return {
    totalWeightMg: sum((c) => c.weightMg),
    goldAmount,
    making,
    subtotal,
    itemDiscount,
    overall,
    discount,
    grandTotal: subtotal - discount,
  };
}
