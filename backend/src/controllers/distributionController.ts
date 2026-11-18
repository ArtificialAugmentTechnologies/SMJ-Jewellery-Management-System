import type { Request, Response } from 'express';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseBody, parseId, parseQuery, v } from '../middleware/validate.js';
import {
  products,
  wholesaleDistributionItems,
  wholesaleDistributions,
  wholesaleParties,
} from '../models/schema.js';
import { decrementStock, incrementStock, recordMovement, totalWeight } from '../services/stockService.js';
import { badRequest, notFound } from '../utils/errors.js';

const issueSchema = z.object({
  party_id: z.coerce.number().int().positive(),
  line_member_id: z.coerce.number().int().positive().optional().nullable(),
  items: z
    .array(
      z.object({
        product_id: z.coerce.number().int().positive(),
        quantity: v.int(1, 100_000),
      }),
    )
    .min(1, 'Add at least one product'),
  distribution_date: v.dateTime,
  received_by: v.optionalText(120),
  purpose: v.optionalText(255),
  remarks: v.optionalText(1000),
});

/**
 * Stock outward: issues inventory to a party / shopkeeper / line member.
 * Store stock is decremented and an "outward" movement is logged per product.
 */
export async function issueDistribution(req: Request, res: Response) {
  const body = parseBody(issueSchema, req);
  const productIds = body.items.map((i) => i.product_id);
  if (new Set(productIds).size !== productIds.length) {
    throw badRequest('duplicate_product', 'Each product can appear only once per distribution');
  }
  const id = await getDb().transaction(async (tx) => {
    const [party] = await tx.select().from(wholesaleParties).where(eq(wholesaleParties.id, body.party_id));
    if (!party) throw notFound('Party');
    if (!party.isActive) throw badRequest('party_inactive', 'This wholesale party is inactive');
    if (body.line_member_id) {
      const [lm] = await tx.select().from(wholesaleParties).where(eq(wholesaleParties.id, body.line_member_id));
      if (!lm || lm.partyType !== 'line_member') throw badRequest('invalid_line_member', 'Selected line member is invalid');
    }
    const date = body.distribution_date ?? new Date();
    const [dist] = await tx
      .insert(wholesaleDistributions)
      .values({
        partyId: party.id,
        lineMemberId: body.line_member_id ?? null,
        issuedBy: req.user!.id,
        receivedBy: body.received_by ?? null,
        totalItemsIssued: body.items.reduce((a, i) => a + i.quantity, 0),
        distributionDate: date,
        status: 'open',
        purpose: body.purpose ?? null,
        remarks: body.remarks ?? null,
      })
      .returning();
    for (const item of body.items) {
      const product = await decrementStock(tx, item.product_id, item.quantity);
      const weight = totalWeight(product.weight, item.quantity);
      await tx.insert(wholesaleDistributionItems).values({
        distributionId: dist.id,
        productId: item.product_id,
        quantityIssued: item.quantity,
        weight,
      });
      await recordMovement(tx, {
        productId: item.product_id,
        movementType: 'outward',
        quantity: item.quantity,
        weight,
        toPartyId: party.id,
        referenceType: 'distribution',
        referenceId: dist.id,
        movementDate: date,
        createdBy: req.user!.id,
        remarks: body.purpose ?? `Issued to ${party.name}`,
      });
    }
    return dist.id;
  });
  res.status(201).json({ data: await distributionDetail(id) });
}

const settleSchema = z.object({
  items: z
    .array(
      z.object({
        item_id: z.coerce.number().int().positive(),
        sold: v.int(0, 100_000).default(0),
        returned: v.int(0, 100_000).default(0),
      }),
    )
    .min(1),
  date: v.dateTime,
  received_by: v.optionalText(120),
  remarks: v.optionalText(1000),
});

/**
 * Records items sold and/or returned by the party.
 * Quantities are incremental. sold + returned can never exceed issued
 * (checked here with a row lock and enforced again by a CHECK constraint).
 * Returned items go back into store stock.
 */
export async function settleDistribution(req: Request, res: Response) {
  const id = parseId(req);
  const body = parseBody(settleSchema, req);
  if (body.items.every((i) => i.sold === 0 && i.returned === 0)) {
    throw badRequest('nothing_to_record', 'Enter a sold or returned quantity');
  }
  await getDb().transaction(async (tx) => {
    const locked = await tx.execute<{ id: number; party_id: number }>(
      sql`SELECT id, party_id FROM wholesale_distributions WHERE id = ${id} FOR UPDATE`,
    );
    const dist = locked.rows[0];
    if (!dist) throw notFound('Distribution');
    const date = body.date ?? new Date();
    const itemIds = body.items.map((i) => i.item_id);
    const rows = await tx
      .select()
      .from(wholesaleDistributionItems)
      .where(inArray(wholesaleDistributionItems.id, itemIds))
      .for('update');
    let anyReturn = false;
    for (const change of body.items) {
      const row = rows.find((r) => r.id === change.item_id && r.distributionId === id);
      if (!row) throw badRequest('invalid_item', `Item ${change.item_id} does not belong to this distribution`);
      const remaining = row.quantityIssued - row.quantitySold - row.quantityReturned;
      if (change.sold + change.returned > remaining) {
        throw badRequest(
          'exceeds_remaining',
          `Sold + returned (${change.sold + change.returned}) exceeds the remaining quantity (${remaining})`,
          { itemId: row.id, remaining },
        );
      }
      if (change.sold === 0 && change.returned === 0) continue;
      const [product] = await tx.select().from(products).where(eq(products.id, row.productId));
      await tx
        .update(wholesaleDistributionItems)
        .set({
          quantitySold: row.quantitySold + change.sold,
          quantityReturned: row.quantityReturned + change.returned,
          updatedAt: new Date(),
        })
        .where(eq(wholesaleDistributionItems.id, row.id));
      if (change.sold > 0) {
        await recordMovement(tx, {
          productId: row.productId,
          movementType: 'sold',
          quantity: change.sold,
          weight: totalWeight(product.weight, change.sold),
          fromPartyId: dist.party_id,
          referenceType: 'distribution',
          referenceId: id,
          movementDate: date,
          createdBy: req.user!.id,
          remarks: body.remarks ?? 'Sold by party',
        });
      }
      if (change.returned > 0) {
        anyReturn = true;
        await incrementStock(tx, row.productId, change.returned);
        await recordMovement(tx, {
          productId: row.productId,
          movementType: 'returned',
          quantity: change.returned,
          weight: totalWeight(product.weight, change.returned),
          fromPartyId: dist.party_id,
          referenceType: 'distribution',
          referenceId: id,
          movementDate: date,
          createdBy: req.user!.id,
          remarks: [body.received_by ? `Received by ${body.received_by}` : null, body.remarks].filter(Boolean).join(' - ') || 'Returned to store',
        });
      }
    }
    const balance = await tx.execute<{ remaining: number | string; settled: number | string }>(sql`
      SELECT COALESCE(sum(quantity_issued - quantity_sold - quantity_returned), 0) AS remaining,
             COALESCE(sum(quantity_sold + quantity_returned), 0) AS settled
      FROM wholesale_distribution_items WHERE distribution_id = ${id}
    `);
    const remaining = Number(balance.rows[0].remaining);
    await tx
      .update(wholesaleDistributions)
      .set({
        status: remaining === 0 ? 'closed' : Number(balance.rows[0].settled) > 0 ? 'partially_settled' : 'open',
        ...(anyReturn && { lastReturnDate: date }),
        updatedAt: new Date(),
      })
      .where(eq(wholesaleDistributions.id, id));
  });
  res.json({ data: await distributionDetail(id) });
}

async function distributionDetail(id: number) {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT d.*, p.name AS party_name, p.party_type, p.mobile_number AS party_mobile,
           lm.name AS line_member_name, u.name AS issued_by_name
    FROM wholesale_distributions d
    JOIN wholesale_parties p ON p.id = d.party_id
    LEFT JOIN wholesale_parties lm ON lm.id = d.line_member_id
    LEFT JOIN users u ON u.id = d.issued_by
    WHERE d.id = ${id}
  `);
  const dist = result.rows[0];
  if (!dist) throw notFound('Distribution');
  const items = await db
    .select({
      id: wholesaleDistributionItems.id,
      productId: wholesaleDistributionItems.productId,
      productName: products.productName,
      category: products.category,
      metal: products.metal,
      quantityIssued: wholesaleDistributionItems.quantityIssued,
      quantitySold: wholesaleDistributionItems.quantitySold,
      quantityReturned: wholesaleDistributionItems.quantityReturned,
      remaining: sql<number>`${wholesaleDistributionItems.quantityIssued} - ${wholesaleDistributionItems.quantitySold} - ${wholesaleDistributionItems.quantityReturned}`.mapWith(Number),
      weight: wholesaleDistributionItems.weight,
    })
    .from(wholesaleDistributionItems)
    .innerJoin(products, eq(products.id, wholesaleDistributionItems.productId))
    .where(eq(wholesaleDistributionItems.distributionId, id))
    .orderBy(asc(wholesaleDistributionItems.id));
  const history = await db.execute(sql`
    SELECT m.id, m.movement_type, m.quantity, m.weight, m.movement_date, m.remarks,
           p.product_name, u.name AS created_by_name
    FROM stock_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.reference_type = 'distribution' AND m.reference_id = ${id}
    ORDER BY m.movement_date DESC, m.id DESC
  `);
  return { ...dist, items, history: history.rows };
}

export async function getDistribution(req: Request, res: Response) {
  res.json({ data: await distributionDetail(parseId(req)) });
}

const listSchema = z.object({
  party_id: z.coerce.number().int().positive().optional(),
  party_type: z.enum(['party', 'shopkeeper', 'line_member']).optional(),
  status: z.enum(['open', 'partially_settled', 'closed']).optional(),
  ...v.pagination,
});

export async function listDistributions(req: Request, res: Response) {
  const q = parseQuery(listSchema, req);
  const filters = [sql`TRUE`];
  if (q.party_id) filters.push(sql`(d.party_id = ${q.party_id} OR d.line_member_id = ${q.party_id})`);
  if (q.party_type) filters.push(sql`p.party_type = ${q.party_type}`);
  if (q.status) filters.push(sql`d.status = ${q.status}`);
  const rows = await getDb().execute(sql`
    SELECT d.id, d.distribution_date, d.status, d.purpose, d.total_items_issued, d.last_return_date,
           d.received_by, p.id AS party_id, p.name AS party_name, p.party_type,
           lm.name AS line_member_name, u.name AS issued_by_name,
           COALESCE(sum(i.quantity_sold), 0) AS total_sold,
           COALESCE(sum(i.quantity_returned), 0) AS total_returned,
           COALESCE(sum(i.quantity_issued - i.quantity_sold - i.quantity_returned), 0) AS total_remaining,
           COALESCE(sum(i.weight), 0) AS total_weight
    FROM wholesale_distributions d
    JOIN wholesale_parties p ON p.id = d.party_id
    LEFT JOIN wholesale_parties lm ON lm.id = d.line_member_id
    LEFT JOIN users u ON u.id = d.issued_by
    LEFT JOIN wholesale_distribution_items i ON i.distribution_id = d.id
    WHERE ${sql.join(filters, sql` AND `)}
    GROUP BY d.id, p.id, lm.name, u.name
    ORDER BY d.distribution_date DESC, d.id DESC
    LIMIT ${q.limit} OFFSET ${q.offset}
  `);
  res.json({ data: rows.rows });
}

