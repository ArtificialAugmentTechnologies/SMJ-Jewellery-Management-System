import type { Request, Response } from 'express';
import { and, asc, desc, eq, gt, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseBody, parseId, parseQuery, v } from '../middleware/validate.js';
import { CATEGORIES, METALS, products, stockMovements, users, wholesaleParties } from '../models/schema.js';
import { notFound } from '../utils/errors.js';

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  in_stock: z.enum(['true', 'false']).optional(),
  ...v.pagination,
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Products are created with zero stock; stock is only added through Stock Inward (audited). */
const createSchema = z.object({
  product_name: v.name,
  category: z.enum(CATEGORIES),
  metal: z.enum(METALS).default('gold'),
  description: v.optionalText(1000),
  weight: v.decimal(3, { max: 100_000 }),
  purchase_price: v.decimal(2, { max: 100_000_000 }).default('0'),
});

// Explicit (no defaults) so a partial update never resets omitted fields.
const updateSchema = z.object({
  product_name: v.name.optional(),
  category: z.enum(CATEGORIES).optional(),
  metal: z.enum(METALS).optional(),
  description: v.optionalText(1000),
  weight: v.decimal(3, { max: 100_000 }).optional(),
  purchase_price: v.decimal(2, { max: 100_000_000 }).optional(),
});

export async function listProducts(req: Request, res: Response) {
  const q = parseQuery(listSchema, req);
  const conditions = [
    q.search ? or(ilike(products.productName, `%${q.search}%`), ilike(products.description, `%${q.search}%`)) : undefined,
    q.category ? eq(products.category, q.category) : undefined,
    q.in_stock === 'true' ? gt(products.quantity, 0) : undefined,
  ].filter(Boolean);
  const rows = await getDb()
    .select()
    .from(products)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(products.category), asc(products.productName))
    .limit(q.limit)
    .offset(q.offset);
  res.json({ data: rows });
}

export async function getProduct(req: Request, res: Response) {
  const id = parseId(req);
  const db = getDb();
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw notFound('Product');
  const movements = await db
    .select({
      id: stockMovements.id,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      weight: stockMovements.weight,
      movementDate: stockMovements.movementDate,
      referenceType: stockMovements.referenceType,
      referenceId: stockMovements.referenceId,
      remarks: stockMovements.remarks,
      partyName: wholesaleParties.name,
      createdByName: users.name,
    })
    .from(stockMovements)
    .leftJoin(wholesaleParties, sql`${wholesaleParties.id} = COALESCE(${stockMovements.toPartyId}, ${stockMovements.fromPartyId})`)
    .leftJoin(users, eq(users.id, stockMovements.createdBy))
    .where(eq(stockMovements.productId, id))
    .orderBy(desc(stockMovements.movementDate), desc(stockMovements.id))
    .limit(200);
  res.json({ data: { ...product, movements } });
}

export async function createProduct(req: Request, res: Response) {
  const body = parseBody(createSchema, req);
  const [row] = await getDb()
    .insert(products)
    .values({
      productName: body.product_name,
      category: body.category,
      metal: body.metal,
      description: body.description ?? null,
      weight: body.weight,
      purchasePrice: body.purchase_price,
      quantity: 0,
    })
    .returning();
  res.status(201).json({ data: row });
}

export async function updateProduct(req: Request, res: Response) {
  const id = parseId(req);
  const body = parseBody(updateSchema, req);
  const [row] = await getDb()
    .update(products)
    .set({
      ...(body.product_name !== undefined && { productName: body.product_name }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.metal !== undefined && { metal: body.metal }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.weight !== undefined && { weight: body.weight }),
      ...(body.purchase_price !== undefined && { purchasePrice: body.purchase_price }),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id))
    .returning();
  if (!row) throw notFound('Product');
  res.json({ data: row });
}
