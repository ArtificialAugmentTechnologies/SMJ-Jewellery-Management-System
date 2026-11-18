import type { Request, Response } from 'express';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseBody, parseId, parseQuery, v } from '../middleware/validate.js';
import { customers } from '../models/schema.js';
import { conflict, notFound } from '../utils/errors.js';

const createSchema = z.object({
  name: v.name,
  email: v.optionalEmail,
  mobile_number: v.mobile,
});

const updateSchema = z.object({
  name: v.name.optional(),
  email: v.optionalEmail,
  mobile_number: v.mobile.optional(),
});

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  ...v.pagination,
});

export async function listCustomers(req: Request, res: Response) {
  const q = parseQuery(listSchema, req);
  const db = getDb();
  const where = q.search
    ? or(ilike(customers.name, `%${q.search}%`), ilike(customers.mobileNumber, `%${q.search}%`), ilike(customers.email, `%${q.search}%`))
    : undefined;
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      mobileNumber: customers.mobileNumber,
      createdAt: customers.createdAt,
      invoiceCount: sql<number>`(SELECT count(*) FROM invoices i WHERE i.customer_id = ${customers.id})`.mapWith(Number),
      totalPurchases: sql<string>`(SELECT COALESCE(sum(grand_total), 0) FROM invoices i WHERE i.customer_id = ${customers.id})`,
      lastPurchase: sql<string | null>`(SELECT max(invoice_date) FROM invoices i WHERE i.customer_id = ${customers.id})`,
    })
    .from(customers)
    .where(where)
    .orderBy(desc(customers.createdAt))
    .limit(q.limit)
    .offset(q.offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(customers).where(where);
  res.json({ data: rows, total });
}

async function customerWithHistory(id: number) {
  const db = getDb();
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) return null;
  const invoicesResult = await db.execute(sql`
    SELECT id, invoice_number, invoice_date, total_weight, grand_total, amount_paid, payment_status
    FROM invoices WHERE customer_id = ${id}
    ORDER BY invoice_date DESC, id DESC
  `);
  const productsResult = await db.execute(sql`
    SELECT ii.id, ii.product_name, ii.category, ii.metal, ii.weight, ii.quantity, ii.total_amount,
           i.invoice_number, i.invoice_date, i.id AS invoice_id
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.customer_id = ${id}
    ORDER BY i.invoice_date DESC, ii.id
    LIMIT 100
  `);
  const statsResult = await db.execute(sql`
    SELECT count(*) AS invoice_count,
           COALESCE(sum(grand_total), 0) AS total_purchases,
           COALESCE(sum(grand_total - amount_paid), 0) AS outstanding
    FROM invoices WHERE customer_id = ${id}
  `);
  return {
    ...customer,
    stats: statsResult.rows[0],
    invoices: invoicesResult.rows,
    purchasedProducts: productsResult.rows,
  };
}

/** Retail step 1: look up a customer by mobile number. */
export async function lookupByMobile(req: Request, res: Response) {
  const { mobile } = parseQuery(z.object({ mobile: v.mobile }), req);
  const [c] = await getDb().select({ id: customers.id }).from(customers).where(eq(customers.mobileNumber, mobile));
  res.json({ found: !!c, data: c ? await customerWithHistory(c.id) : null });
}

export async function getCustomer(req: Request, res: Response) {
  const data = await customerWithHistory(parseId(req));
  if (!data) throw notFound('Customer');
  res.json({ data });
}

export async function createCustomer(req: Request, res: Response) {
  const body = parseBody(createSchema, req);
  const db = getDb();
  const [existing] = await db.select().from(customers).where(eq(customers.mobileNumber, body.mobile_number));
  if (existing) {
    throw conflict('duplicate_mobile', 'A customer with this mobile number already exists', { customer: existing });
  }
  const [row] = await db
    .insert(customers)
    .values({ name: body.name, email: body.email ?? null, mobileNumber: body.mobile_number })
    .returning();
  res.status(201).json({ data: row });
}

export async function updateCustomer(req: Request, res: Response) {
  const id = parseId(req);
  const body = parseBody(updateSchema, req);
  const [row] = await getDb()
    .update(customers)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.mobile_number !== undefined && { mobileNumber: body.mobile_number }),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id))
    .returning();
  if (!row) throw notFound('Customer');
  res.json({ data: row });
}
