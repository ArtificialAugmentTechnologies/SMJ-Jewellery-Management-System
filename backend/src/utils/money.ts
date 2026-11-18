/**
 * Exact decimal arithmetic for billing.
 * Money is held as paise (1/100 INR) and weight as milligrams (1/1000 g) in BigInt,
 * so totals never suffer from floating point rounding.
 */

function toScaled(value: string | number, scale: number): bigint {
  const str = typeof value === 'number' ? value.toFixed(scale + 2) : String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid decimal value: ${value}`);
  const negative = str.startsWith('-');
  const [intPart, fracPart = ''] = str.replace('-', '').split('.');
  // Round half up on the first dropped digit.
  const kept = (fracPart + '0'.repeat(scale)).slice(0, scale);
  const nextDigit = Number(fracPart[scale] ?? '0');
  let result = BigInt(intPart) * 10n ** BigInt(scale) + BigInt(kept || '0');
  if (nextDigit >= 5) result += 1n;
  return negative ? -result : result;
}

function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(scale);
  const intPart = abs / base;
  const frac = (abs % base).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${intPart}.${frac}`;
}

export const toPaise = (v: string | number) => toScaled(v, 2);
export const fromPaise = (v: bigint) => fromScaled(v, 2);
export const toMilligrams = (v: string | number) => toScaled(v, 3);
export const fromMilligrams = (v: bigint) => fromScaled(v, 3);

/** Divides with round-half-up for non-negative values. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export interface LineInput {
  weight: string | number; // grams per piece
  quantity: number;
  rate: string | number; // INR per gram
  makingCharges: string | number; // INR for the line
  discount: string | number; // INR for the line
}

export interface LineResult {
  weightMg: bigint; // total line weight
  goldAmount: bigint;
  makingCharges: bigint;
  discount: bigint;
  subtotal: bigint;
  total: bigint;
}

/**
 * Gold Amount   = Weight x Rate x Quantity
 * Item Subtotal = Gold Amount + Making Charges
 * Item Total    = Item Subtotal - Discount
 */
export function calculateLine(line: LineInput): LineResult {
  const weightMg = toMilligrams(line.weight);
  const ratePaise = toPaise(line.rate);
  const qty = BigInt(line.quantity);
  const goldAmount = divRound(weightMg * ratePaise * qty, 1000n);
  const makingCharges = toPaise(line.makingCharges);
  const discount = toPaise(line.discount);
  const subtotal = goldAmount + makingCharges;
  return {
    weightMg: weightMg * qty,
    goldAmount,
    makingCharges,
    discount,
    subtotal,
    total: subtotal - discount,
  };
}
