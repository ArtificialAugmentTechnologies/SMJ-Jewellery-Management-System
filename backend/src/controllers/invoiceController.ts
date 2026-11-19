import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseBody, parseId, parseQuery, v } from '../middleware/validate.js';
import { CATEGORIES, METALS, PAYMENT_METHODS } from '../models/schema.js';
import { addPayment, createInvoice, getInvoiceDetail } from '../services/invoiceService.js';

const itemSchema = z.object({
  product_id: z.coerce.number().int().positive().optional().nullable(),
  product_name: v.optionalText(150),
  category: z.enum(CATEGORIES),
  metal: z.enum(METALS).default('gold'),
  description: v.optionalText(1000),
  weight: v.decimal(3, { positive: true, max: 100_000 }),
  quantity: v.int(1, 10_000),
  making_charges: v.decimal(2, { max: 100_000_000 }).default('0'),
  discount: v.decimal(2, { max: 100_000_000 }).default('0'),
});

const paymentSchema = z.object({
  amount: v.decimal(2, { max: 1_000_000_000 }),
  method: z.enum(PAYMENT_METHODS),
  reference: v.optionalText(120),
});

const baseInvoiceSchema = {
  gold_rate_id: z.coerce.number().int().positive().optional().nullable(),
  items: z.array(itemSchema).min(1, 'Add at least one product').max(100),
  overall_discount: v.decimal(2, { max: 1_000_000_000 }).default('0'),
  /** Optional GST %, 0 = no GST. Indian GST on jewellery is 3%. */
  gst_rate: v.decimal(2, { max: 28 }).default('0'),
  payment: paymentSchema.optional().nullable(),
  notes: v.optionalText(1000),
};

const retailSchema = z.object({ customer_id: z.coerce.number().int().positive(), ...baseInvoiceSchema });
const wholesaleSchema = z.object({ party_id: z.coerce.number().int().positive(), ...baseInvoiceSchema });

export async function createRetailInvoice(req: Request, res: Response) {
  const body = parseBody(retailSchema, req);
  const db = getDb();
  const invoice = await db.transaction((tx) =>
    createInvoice(tx, {
      type: 'retail',
      customerId: body.customer_id,
      goldRateId: body.gold_rate_id,
      items: body.items,
      overallDiscount: body.overall_discount,
      gstRate: body.gst_rate,
      payment: body.payment,
      notes: body.notes,
      userId: req.user!.id,
    }),
  );
  res.status(201).json({ data: await getInvoiceDetail(db, invoice.id) });
}

export async function createWholesaleInvoice(req: Request, res: Response) {
  const body = parseBody(wholesaleSchema, req);
  const db = getDb();
  const invoice = await db.transaction((tx) =>
    createInvoice(tx, {
      type: 'wholesale',
      partyId: body.party_id,
      goldRateId: body.gold_rate_id,
      items: body.items,
      overallDiscount: body.overall_discount,
      gstRate: body.gst_rate,
      payment: body.payment,
      notes: body.notes,
      userId: req.user!.id,
    }),
  );
  res.status(201).json({ data: await getInvoiceDetail(db, invoice.id) });
}

export async function getInvoice(req: Request, res: Response) {
  res.json({ data: await getInvoiceDetail(getDb(), parseId(req)) });
}

const listSchema = z.object({
  type: z.enum(['retail', 'wholesale']).optional(),
  search: z.string().trim().max(100).optional(), // invoice number, customer / party name or mobile
  invoice_number: z.string().trim().max(30).optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  party_id: z.coerce.number().int().positive().optional(),
  payment_status: z.enum(['paid', 'partial', 'unpaid']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...v.pagination,
});

export async function listInvoices(req: Request, res: Response) {
  const q = parseQuery(listSchema, req);
  const f = [sql`TRUE`];
  if (q.type) f.push(sql`i.invoice_type = ${q.type}`);
  if (q.invoice_number) f.push(sql`i.invoice_number ILIKE ${'%' + q.invoice_number + '%'}`);
  if (q.customer_id) f.push(sql`i.customer_id = ${q.customer_id}`);
  if (q.party_id) f.push(sql`i.party_id = ${q.party_id}`);
  if (q.payment_status) f.push(sql`i.payment_status = ${q.payment_status}`);
  if (q.from) f.push(sql`i.invoice_date >= ${q.from.toISOString()}`);
  if (q.to) f.push(sql`i.invoice_date < ${q.to.toISOString()}`);
  if (q.search) {
    const s = '%' + q.search + '%';
    f.push(sql`(i.invoice_number ILIKE ${s} OR c.name ILIKE ${s} OR c.mobile_number ILIKE ${s}
               OR p.name ILIKE ${s} OR p.mobile_number ILIKE ${s})`);
  }
  const where = sql.join(f, sql` AND `);
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT i.id, i.invoice_number, i.invoice_type, i.invoice_date, i.total_weight, i.grand_total,
           i.amount_paid, i.payment_status,
           COALESCE(c.name, p.name) AS owner_name,
           COALESCE(c.mobile_number, p.mobile_number) AS owner_mobile
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    LEFT JOIN wholesale_parties p ON p.id = i.party_id
    WHERE ${where}
    ORDER BY i.invoice_date DESC, i.id DESC
    LIMIT ${q.limit} OFFSET ${q.offset}
  `);
  const totals = await db.execute(sql`
    SELECT count(*) AS total, COALESCE(sum(i.grand_total), 0) AS sum_grand_total,
           COALESCE(sum(i.total_weight), 0) AS sum_weight
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    LEFT JOIN wholesale_parties p ON p.id = i.party_id
    WHERE ${where}
  `);
  res.json({ data: rows.rows, ...totals.rows[0], total: Number(totals.rows[0].total) });
}

const addPaymentSchema = paymentSchema.extend({ date: v.dateTime });

export async function recordPayment(req: Request, res: Response) {
  const id = parseId(req);
  const body = parseBody(addPaymentSchema, req);
  const db = getDb();
  await db.transaction((tx) =>
    addPayment(tx, id, { amount: body.amount, method: body.method, reference: body.reference, date: body.date }, req.user!.id),
  );
  res.status(201).json({ data: await getInvoiceDetail(db, id) });
}
