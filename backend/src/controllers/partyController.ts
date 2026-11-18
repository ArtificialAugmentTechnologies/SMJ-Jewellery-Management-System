import type { Request, Response } from 'express';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseBody, parseId, parseQuery, v } from '../middleware/validate.js';
import { PARTY_TYPES, wholesaleParties } from '../models/schema.js';
import { conflict, notFound } from '../utils/errors.js';

const createSchema = z.object({
  name: v.name,
  mobile_number: v.mobile,
  email: v.optionalEmail,
  address: v.optionalText(500),
  party_type: z.enum(PARTY_TYPES),
});

const updateSchema = z.object({
  name: v.name.optional(),
  mobile_number: v.mobile.optional(),
  email: v.optionalEmail,
  address: v.optionalText(500),
  is_active: z.boolean().optional(),
});

const listSchema = z.object({
  type: z.enum(PARTY_TYPES).optional(),
  search: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false']).optional(),
});

export async function listParties(req: Request, res: Response) {
  const q = parseQuery(listSchema, req);
  const filters = [sql`TRUE`];
  if (q.type) filters.push(sql`p.party_type = ${q.type}`);
  if (q.active) filters.push(sql`p.is_active = ${q.active === 'true'}`);
  if (q.search) filters.push(sql`(p.name ILIKE ${'%' + q.search + '%'} OR p.mobile_number ILIKE ${'%' + q.search + '%'})`);
  const rows = await getDb().execute(sql`
    SELECT p.*,
      COALESCE(ds.issued, 0)    AS stock_issued,
      COALESCE(ds.sold, 0)      AS stock_sold,
      COALESCE(ds.returned, 0)  AS stock_returned,
      COALESCE(ds.remaining, 0) AS stock_remaining,
      COALESCE(inv.total, 0)    AS sales_total,
      COALESCE(inv.outstanding, 0) AS outstanding
    FROM wholesale_parties p
    LEFT JOIN LATERAL (
      SELECT sum(i.quantity_issued) AS issued, sum(i.quantity_sold) AS sold,
             sum(i.quantity_returned) AS returned,
             sum(i.quantity_issued - i.quantity_sold - i.quantity_returned) AS remaining
      FROM wholesale_distributions d JOIN wholesale_distribution_items i ON i.distribution_id = d.id
      WHERE d.party_id = p.id OR d.line_member_id = p.id
    ) ds ON TRUE
    LEFT JOIN LATERAL (
      SELECT sum(grand_total) AS total, sum(grand_total - amount_paid) AS outstanding
      FROM invoices WHERE party_id = p.id
    ) inv ON TRUE
    WHERE ${sql.join(filters, sql` AND `)}
    ORDER BY p.name
  `);
  res.json({ data: rows.rows });
}

export async function getParty(req: Request, res: Response) {
  const id = parseId(req);
  const db = getDb();
  const [party] = await db.select().from(wholesaleParties).where(eq(wholesaleParties.id, id));
  if (!party) throw notFound('Party');
  const stats = await db.execute(sql`
    SELECT
      COALESCE(sum(i.quantity_issued), 0)   AS stock_issued,
      COALESCE(sum(i.quantity_sold), 0)     AS stock_sold,
      COALESCE(sum(i.quantity_returned), 0) AS stock_returned,
      COALESCE(sum(i.quantity_issued - i.quantity_sold - i.quantity_returned), 0) AS stock_remaining
    FROM wholesale_distributions d JOIN wholesale_distribution_items i ON i.distribution_id = d.id
    WHERE d.party_id = ${id} OR d.line_member_id = ${id}
  `);
  const invoiceStats = await db.execute(sql`
    SELECT count(*) AS invoice_count,
           COALESCE(sum(grand_total), 0) AS sales_total,
           COALESCE(sum(amount_paid), 0) AS paid_total,
           COALESCE(sum(grand_total - amount_paid), 0) AS outstanding
    FROM invoices WHERE party_id = ${id}
  `);
  const invoiceRows = await db.execute(sql`
    SELECT id, invoice_number, invoice_date, total_weight, grand_total, amount_paid, payment_status
    FROM invoices WHERE party_id = ${id} ORDER BY invoice_date DESC, id DESC LIMIT 200
  `);
  const movementRows = await db.execute(sql`
    SELECT m.id, m.movement_type, m.quantity, m.weight, m.movement_date, m.reference_type, m.reference_id,
           m.remarks, p.product_name, p.category
    FROM stock_movements m JOIN products p ON p.id = m.product_id
    WHERE m.to_party_id = ${id} OR m.from_party_id = ${id}
    ORDER BY m.movement_date DESC, m.id DESC LIMIT 300
  `);
  res.json({
    data: {
      ...party,
      stats: { ...stats.rows[0], ...invoiceStats.rows[0] },
      invoices: invoiceRows.rows,
      movements: movementRows.rows,
    },
  });
}

async function assertUniqueMobile(mobile: string, type: string, excludeId?: number) {
  const [dup] = await getDb()
    .select({ id: wholesaleParties.id })
    .from(wholesaleParties)
    .where(
      and(
        eq(wholesaleParties.mobileNumber, mobile),
        eq(wholesaleParties.partyType, type),
        excludeId ? ne(wholesaleParties.id, excludeId) : undefined,
      ),
    );
  if (dup) throw conflict('duplicate_mobile', 'A record of this type with this mobile number already exists');
}

export async function createParty(req: Request, res: Response) {
  const body = parseBody(createSchema, req);
  await assertUniqueMobile(body.mobile_number, body.party_type);
  const [row] = await getDb()
    .insert(wholesaleParties)
    .values({
      name: body.name,
      mobileNumber: body.mobile_number,
      email: body.email ?? null,
      address: body.address ?? null,
      partyType: body.party_type,
    })
    .returning();
  res.status(201).json({ data: row });
}

export async function updateParty(req: Request, res: Response) {
  const id = parseId(req);
  const body = parseBody(updateSchema, req);
  const db = getDb();
  const [current] = await db.select().from(wholesaleParties).where(eq(wholesaleParties.id, id));
  if (!current) throw notFound('Party');
  if (body.mobile_number) await assertUniqueMobile(body.mobile_number, current.partyType, id);
  const [row] = await db
    .update(wholesaleParties)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.mobile_number !== undefined && { mobileNumber: body.mobile_number }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.is_active !== undefined && { isActive: body.is_active }),
      updatedAt: new Date(),
    })
    .where(eq(wholesaleParties.id, id))
    .returning();
  res.json({ data: row });
}
