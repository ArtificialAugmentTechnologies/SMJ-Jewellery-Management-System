import { asc, desc, eq, sql } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../config/db.js';
import {
  customers,
  invoiceItems,
  invoices,
  payments,
  products,
  users,
  wholesaleParties,
} from '../models/schema.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { calculateLine, fromMilligrams, fromPaise, toPaise } from '../utils/money.js';
import { getCurrentRate } from './goldRateService.js';
import { decrementStock, recordMovement, totalWeight } from './stockService.js';

export interface InvoiceItemInput {
  product_id?: number | null;
  product_name?: string | null;
  category: 'Tumbler' | 'Chain' | 'Anklet' | 'Ring';
  metal: 'gold' | 'silver';
  description?: string | null;
  weight: string;
  quantity: number;
  making_charges: string;
  discount: string;
}

export interface PaymentInput {
  amount: string;
  method: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'other';
  reference?: string | null;
}

export interface CreateInvoiceInput {
  type: 'retail' | 'wholesale';
  customerId?: number;
  partyId?: number;
  goldRateId?: number | null;
  items: InvoiceItemInput[];
  overallDiscount: string;
  /** Total GST % (e.g. "3"); "0" or empty = no GST. */
  gstRate?: string;
  payment?: PaymentInput | null;
  notes?: string | null;
  userId: number;
}

export function paymentStatus(paid: bigint, total: bigint): 'paid' | 'partial' | 'unpaid' {
  if (total === 0n || paid >= total) return 'paid';
  if (paid > 0n) return 'partial';
  return 'unpaid';
}

/**
 * Creates a completed invoice in a single transaction:
 *  - snapshots today's gold/silver rate on every line,
 *  - recalculates every amount on the server (client totals are never trusted),
 *  - deducts inventory for lines linked to a product and logs a "sold" movement,
 *  - records an optional initial payment.
 */
export async function createInvoice(tx: Tx, input: CreateInvoiceInput) {
  if (input.items.length === 0) throw badRequest('no_items', 'Add at least one product to the invoice');

  const rate = await getCurrentRate(tx);
  if (!rate) throw conflict('no_gold_rate', "Today's gold rate has not been set. Ask an administrator to update it.");
  if (input.goldRateId && input.goldRateId !== rate.id) {
    throw conflict(
      'rate_changed',
      'The gold rate was updated while this bill was being prepared. Review the new rate and submit again.',
      { currentRate: rate },
    );
  }

  // Validate the owner.
  if (input.type === 'retail') {
    const [c] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId!));
    if (!c) throw notFound('Customer');
  } else {
    const [p] = await tx
      .select({ id: wholesaleParties.id, isActive: wholesaleParties.isActive })
      .from(wholesaleParties)
      .where(eq(wholesaleParties.id, input.partyId!));
    if (!p) throw notFound('Wholesale party');
    if (!p.isActive) throw badRequest('party_inactive', 'This wholesale party is inactive');
  }

  // Resolve products and compute every line.
  interface Line {
    item: InvoiceItemInput;
    productName: string;
    category: InvoiceItemInput['category'];
    metal: InvoiceItemInput['metal'];
    lineRate: string;
    calc: ReturnType<typeof calculateLine>;
  }
  const lines: Line[] = [];
  for (const [index, item] of input.items.entries()) {
    let productName = item.product_name?.trim() || '';
    let category = item.category;
    let metal = item.metal;
    if (item.product_id) {
      const [product] = await tx.select().from(products).where(eq(products.id, item.product_id));
      if (!product) throw notFound(`Product on line ${index + 1}`);
      productName = productName || product.productName;
      category = product.category as typeof category;
      metal = product.metal as typeof metal;
    }
    if (!productName) productName = item.description?.trim() || category;

    const lineRate = metal === 'silver' ? rate.silverRatePerGram : rate.goldRatePerGram;
    const calc = calculateLine({
      weight: item.weight,
      quantity: item.quantity,
      rate: lineRate,
      makingCharges: item.making_charges,
      discount: item.discount,
    });
    if (calc.total < 0n) {
      throw badRequest(
        'discount_exceeds_amount',
        `Discount on line ${index + 1} (${productName}) cannot exceed its subtotal`,
        { line: index + 1 },
      );
    }
    lines.push({ item, productName, category, metal, lineRate, calc });
  }

  const sum = (pick: (l: Line) => bigint) => lines.reduce((acc, l) => acc + pick(l), 0n);
  const totalWeightMg = sum((l) => l.calc.weightMg);
  const goldAmount = sum((l) => l.calc.goldAmount);
  const makingCharges = sum((l) => l.calc.makingCharges);
  const subtotal = goldAmount + makingCharges;
  const itemDiscount = sum((l) => l.calc.discount);
  const overallDiscount = toPaise(input.overallDiscount || '0');
  const discount = itemDiscount + overallDiscount;
  const taxable = subtotal - discount;
  if (taxable < 0n) {
    throw badRequest('discount_exceeds_amount', 'Total discount cannot exceed the invoice subtotal');
  }
  // Optional GST on the taxable value, rounded half-up to the paisa.
  const gstRateX100 = toPaise(input.gstRate || '0'); // 3% -> 300
  const gstAmount = (taxable * gstRateX100 * 2n + 10000n) / 20000n;
  const grandTotal = taxable + gstAmount;

  const paidNow = input.payment ? toPaise(input.payment.amount) : 0n;
  if (paidNow > grandTotal) {
    throw badRequest('payment_exceeds_total', 'Payment amount cannot exceed the grand total');
  }

  // Invoice number: SMJ-R-2026-00001 (retail) / SMJ-W-2026-00001 (wholesale)
  const seqName = input.type === 'retail' ? 'retail_invoice_seq' : 'wholesale_invoice_seq';
  const seqResult = await tx.execute<{ n: number | string }>(sql.raw(`SELECT nextval('${seqName}') AS n`));
  const seq = Number(seqResult.rows[0].n);
  const invoiceNumber = `SMJ-${input.type === 'retail' ? 'R' : 'W'}-${new Date().getFullYear()}-${String(seq).padStart(5, '0')}`;

  const [invoice] = await tx
    .insert(invoices)
    .values({
      invoiceNumber,
      invoiceType: input.type,
      customerId: input.type === 'retail' ? input.customerId! : null,
      partyId: input.type === 'wholesale' ? input.partyId! : null,
      goldRateId: rate.id,
      goldRatePerGram: rate.goldRatePerGram,
      silverRatePerGram: rate.silverRatePerGram,
      totalWeight: fromMilligrams(totalWeightMg),
      goldAmount: fromPaise(goldAmount),
      makingCharges: fromPaise(makingCharges),
      subtotal: fromPaise(subtotal),
      itemDiscount: fromPaise(itemDiscount),
      overallDiscount: fromPaise(overallDiscount),
      discount: fromPaise(discount),
      gstRate: fromPaise(gstRateX100),
      gstAmount: fromPaise(gstAmount),
      grandTotal: fromPaise(grandTotal),
      amountPaid: fromPaise(paidNow),
      paymentStatus: paymentStatus(paidNow, grandTotal),
      notes: input.notes ?? null,
      createdBy: input.userId,
    })
    .returning();

  for (const line of lines) {
    await tx.insert(invoiceItems).values({
      invoiceId: invoice.id,
      productId: line.item.product_id ?? null,
      productName: line.productName,
      category: line.category,
      metal: line.metal,
      description: line.item.description ?? null,
      weight: line.item.weight,
      quantity: line.item.quantity,
      goldRate: line.lineRate,
      goldAmount: fromPaise(line.calc.goldAmount),
      makingCharges: fromPaise(line.calc.makingCharges),
      discount: fromPaise(line.calc.discount),
      totalAmount: fromPaise(line.calc.total),
    });

    if (line.item.product_id) {
      await decrementStock(tx, line.item.product_id, line.item.quantity);
      await recordMovement(tx, {
        productId: line.item.product_id,
        movementType: 'sold',
        quantity: line.item.quantity,
        weight: totalWeight(line.item.weight, line.item.quantity),
        toPartyId: input.type === 'wholesale' ? input.partyId : null,
        referenceType: 'invoice',
        referenceId: invoice.id,
        createdBy: input.userId,
        remarks: `${input.type === 'retail' ? 'Retail' : 'Wholesale'} sale - ${invoiceNumber}`,
      });
    }
  }

  if (input.payment && paidNow > 0n) {
    await tx.insert(payments).values({
      invoiceId: invoice.id,
      amount: fromPaise(paidNow),
      paymentMethod: input.payment.method,
      paymentReference: input.payment.reference ?? null,
      receivedBy: input.userId,
    });
  }

  return invoice;
}

/** Records an additional payment against an existing invoice (row-locked). */
export async function addPayment(tx: Tx, invoiceId: number, payment: PaymentInput & { date?: Date }, userId: number) {
  const locked = await tx.execute<{ id: number; grand_total: string; amount_paid: string }>(
    sql`SELECT id, grand_total, amount_paid FROM invoices WHERE id = ${invoiceId} FOR UPDATE`,
  );
  const inv = locked.rows[0];
  if (!inv) throw notFound('Invoice');
  const total = toPaise(inv.grand_total);
  const alreadyPaid = toPaise(inv.amount_paid);
  const amount = toPaise(payment.amount);
  if (amount <= 0n) throw badRequest('invalid_amount', 'Payment amount must be greater than zero');
  if (alreadyPaid + amount > total) {
    throw badRequest('payment_exceeds_total', `Payment exceeds the outstanding balance of ${fromPaise(total - alreadyPaid)}`);
  }
  const [row] = await tx
    .insert(payments)
    .values({
      invoiceId,
      amount: fromPaise(amount),
      paymentMethod: payment.method,
      paymentReference: payment.reference ?? null,
      paymentDate: payment.date ?? new Date(),
      receivedBy: userId,
    })
    .returning();
  const newPaid = alreadyPaid + amount;
  await tx
    .update(invoices)
    .set({ amountPaid: fromPaise(newPaid), paymentStatus: paymentStatus(newPaid, total) })
    .where(eq(invoices.id, invoiceId));
  return row;
}

/** Full invoice with items, payments, owner and creator - used for display / print. */
export async function getInvoiceDetail(db: DbOrTx, id: number) {
  const [inv] = await db
    .select({
      invoice: invoices,
      customer: { id: customers.id, name: customers.name, mobileNumber: customers.mobileNumber, email: customers.email },
      party: {
        id: wholesaleParties.id,
        name: wholesaleParties.name,
        mobileNumber: wholesaleParties.mobileNumber,
        email: wholesaleParties.email,
        address: wholesaleParties.address,
        partyType: wholesaleParties.partyType,
      },
      createdByName: users.name,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .leftJoin(wholesaleParties, eq(wholesaleParties.id, invoices.partyId))
    .leftJoin(users, eq(users.id, invoices.createdBy))
    .where(eq(invoices.id, id));
  if (!inv) throw notFound('Invoice');
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.id));
  const paymentRows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      paymentMethod: payments.paymentMethod,
      paymentDate: payments.paymentDate,
      paymentReference: payments.paymentReference,
      receivedByName: users.name,
    })
    .from(payments)
    .leftJoin(users, eq(users.id, payments.receivedBy))
    .where(eq(payments.invoiceId, id))
    .orderBy(desc(payments.paymentDate));
  return {
    ...inv.invoice,
    customer: inv.customer?.id ? inv.customer : null,
    party: inv.party?.id ? inv.party : null,
    createdByName: inv.createdByName,
    items,
    payments: paymentRows,
  };
}
