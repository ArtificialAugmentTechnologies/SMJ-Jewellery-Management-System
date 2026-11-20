import type { Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseBody, parseQuery, v } from '../middleware/validate.js';
import { CATEGORIES, METALS, products } from '../models/schema.js';
import { incrementStock, recordMovement, totalWeight } from '../services/stockService.js';
import { notFound } from '../utils/errors.js';

const inwardSchema = z
  .object({
    product_id: z.coerce.number().int().positive().optional().nullable(),
    // Used when product_id is not given: an existing product with the same name + category
    // receives the stock, otherwise a new product is created.
    product_name: v.name.optional(),
    category: z.enum(CATEGORIES).optional(),
    metal: z.enum(METALS).optional(),
    description: v.optionalText(1000),
    weight: v.decimal(3, { positive: true, max: 100_000 }), // weight per piece (g)
    quantity: v.int(1, 100_000),
    purchase_price: v.decimal(2, { max: 100_000_000 }), // price per piece
    supplier_details: v.optionalText(500),
    date: v.dateTime,
    remarks: v.optionalText(500),
  })
  .refine((b) => b.product_id || (b.product_name && b.category), {
    message: 'Select a product or enter a product name and category',
    path: ['product_name'],
  });

export async function stockInward(req: Request, res: Response) {
  const body = parseBody(inwardSchema, req);
  const result = await getDb().transaction(async (tx) => {
    let product;
    if (body.product_id) {
      [product] = await tx.select().from(products).where(eq(products.id, body.product_id));
      if (!product) throw notFound('Product');
    } else {
      [product] = await tx
        .select()
        .from(products)
        .where(and(sql`lower(${products.productName}) = lower(${body.product_name!})`, eq(products.category, body.category!)));
      if (!product) {
        [product] = await tx
          .insert(products)
          .values({
            productName: body.product_name!,
            category: body.category!,
            metal: body.metal ?? 'gold',
            description: body.description ?? null,
            weight: body.weight,
            purchasePrice: body.purchase_price,
            quantity: 0,
          })
          .returning();
      }
    }
    await incrementStock(tx, product.id, body.quantity);
    const [updated] = await tx
      .update(products)
      .set({ purchasePrice: body.purchase_price, weight: body.weight, updatedAt: new Date() })
      .where(eq(products.id, product.id))
      .returning();
    const movement = await recordMovement(tx, {
      productId: product.id,
      movementType: 'inward',
      quantity: body.quantity,
      weight: totalWeight(body.weight, body.quantity),
      unitPrice: body.purchase_price,
      supplierDetails: body.supplier_details ?? null,
      referenceType: 'stock_inward',
      movementDate: body.date ?? new Date(),
      createdBy: req.user!.id,
      remarks: body.remarks ?? null,
    });
    return { product: updated, movement };
  });
  res.status(201).json({ data: result });
}

const movementsSchema = z.object({
  type: z.enum(['inward', 'outward', 'sold', 'returned']).optional(),
  product_id: z.coerce.number().int().positive().optional(),
  party_id: z.coerce.number().int().positive().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ...v.pagination,
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export async function listMovements(req: Request, res: Response) {
  const q = parseQuery(movementsSchema, req);
  const filters = [sql`TRUE`];
  if (q.type) filters.push(sql`m.movement_type = ${q.type}`);
  if (q.product_id) filters.push(sql`m.product_id = ${q.product_id}`);
  if (q.party_id) filters.push(sql`(m.to_party_id = ${q.party_id} OR m.from_party_id = ${q.party_id})`);
  if (q.from) filters.push(sql`m.movement_date >= ${q.from.toISOString()}`);
  if (q.to) filters.push(sql`m.movement_date < ${q.to.toISOString()}`);
  const where = sql.join(filters, sql` AND `);
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT m.id, m.movement_type, m.quantity, m.weight, m.unit_price, m.supplier_details,
           m.reference_type, m.reference_id, m.movement_date, m.remarks,
           p.id AS product_id, p.product_name, p.category, p.metal,
           tp.name AS to_party_name, fp.name AS from_party_name, u.name AS created_by_name,
           i.invoice_number
    FROM stock_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN wholesale_parties tp ON tp.id = m.to_party_id
    LEFT JOIN wholesale_parties fp ON fp.id = m.from_party_id
    LEFT JOIN users u ON u.id = m.created_by
    LEFT JOIN invoices i ON m.reference_type = 'invoice' AND i.id = m.reference_id
    WHERE ${where}
    ORDER BY m.movement_date DESC, m.id DESC
    LIMIT ${q.limit} OFFSET ${q.offset}
  `);
  const total = await db.execute(sql`SELECT count(*) AS total FROM stock_movements m WHERE ${where}`);
  res.json({ data: rows.rows, total: Number(total.rows[0].total) });
}

export async function stockSummary(_req: Request, res: Response) {
  const db = getDb();
  const totals = await db.execute(sql`
    SELECT
      COALESCE(sum(quantity) FILTER (WHERE movement_type = 'inward'), 0)   AS total_in,
      COALESCE(sum(weight)   FILTER (WHERE movement_type = 'inward'), 0)   AS total_in_weight,
      COALESCE(sum(quantity) FILTER (WHERE movement_type = 'outward'), 0)  AS total_out,
      COALESCE(sum(weight)   FILTER (WHERE movement_type = 'outward'), 0)  AS total_out_weight,
      -- Stock put back when a saved bill is edited is netted off sales, not counted as a party return.
      COALESCE(sum(quantity) FILTER (WHERE movement_type = 'sold'), 0)
        - COALESCE(sum(quantity) FILTER (WHERE (movement_type = 'returned' AND reference_type = 'invoice')), 0)                  AS sold,
      COALESCE(sum(weight)   FILTER (WHERE movement_type = 'sold'), 0)
        - COALESCE(sum(weight)   FILTER (WHERE (movement_type = 'returned' AND reference_type = 'invoice')), 0)                  AS sold_weight,
      COALESCE(sum(quantity) FILTER (WHERE movement_type = 'returned' AND reference_type IS DISTINCT FROM 'invoice'), 0) AS returned,
      COALESCE(sum(weight)   FILTER (WHERE movement_type = 'returned' AND reference_type IS DISTINCT FROM 'invoice'), 0) AS returned_weight
    FROM stock_movements
  `);
  const available = await db.execute(sql`
    SELECT COALESCE(sum(quantity), 0) AS available, COALESCE(sum(quantity * weight), 0) AS available_weight
    FROM products
  `);
  const withParties = await db.execute(sql`
    SELECT COALESCE(sum(quantity_issued - quantity_sold - quantity_returned), 0) AS with_parties
    FROM wholesale_distribution_items
  `);
  const byCategory = await db.execute(sql`
    SELECT category, count(*) AS products, COALESCE(sum(quantity), 0) AS quantity,
           COALESCE(sum(quantity * weight), 0) AS weight
    FROM products GROUP BY category ORDER BY category
  `);
  res.json({
    data: {
      ...totals.rows[0],
      ...available.rows[0],
      ...withParties.rows[0],
      byCategory: byCategory.rows,
    },
  });
}

