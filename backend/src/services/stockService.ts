import { and, eq, gte, sql } from 'drizzle-orm';
import type { Tx } from '../config/db.js';
import { products, stockMovements } from '../models/schema.js';
import { conflict, notFound } from '../utils/errors.js';
import { fromMilligrams, toMilligrams } from '../utils/money.js';

type MovementType = 'inward' | 'outward' | 'sold' | 'returned';
type ReferenceType = 'stock_inward' | 'distribution' | 'invoice' | 'adjustment';

export interface MovementInput {
  productId: number;
  movementType: MovementType;
  quantity: number;
  weight: string;
  unitPrice?: string | null;
  supplierDetails?: string | null;
  fromPartyId?: number | null;
  toPartyId?: number | null;
  referenceType?: ReferenceType | null;
  referenceId?: number | null;
  movementDate?: Date;
  createdBy: number;
  remarks?: string | null;
}

export async function recordMovement(tx: Tx, m: MovementInput) {
  const [row] = await tx
    .insert(stockMovements)
    .values({
      productId: m.productId,
      movementType: m.movementType,
      quantity: m.quantity,
      weight: m.weight,
      unitPrice: m.unitPrice ?? null,
      supplierDetails: m.supplierDetails ?? null,
      fromPartyId: m.fromPartyId ?? null,
      toPartyId: m.toPartyId ?? null,
      referenceType: m.referenceType ?? null,
      referenceId: m.referenceId ?? null,
      movementDate: m.movementDate ?? new Date(),
      createdBy: m.createdBy,
      remarks: m.remarks ?? null,
    })
    .returning();
  return row;
}

/**
 * Atomically removes `quantity` pieces from store stock.
 * The conditional UPDATE guarantees stock never goes negative even under
 * concurrent billing (the row lock serialises competing transactions).
 */
export async function decrementStock(tx: Tx, productId: number, quantity: number) {
  const [updated] = await tx
    .update(products)
    .set({ quantity: sql`${products.quantity} - ${quantity}`, updatedAt: new Date() })
    .where(and(eq(products.id, productId), gte(products.quantity, quantity)))
    .returning();
  if (updated) return updated;
  const [existing] = await tx.select().from(products).where(eq(products.id, productId));
  if (!existing) throw notFound('Product');
  throw conflict(
    'insufficient_stock',
    `Insufficient stock for "${existing.productName}": available ${existing.quantity}, requested ${quantity}`,
    { productId, available: existing.quantity, requested: quantity },
  );
}

export async function incrementStock(tx: Tx, productId: number, quantity: number) {
  const [updated] = await tx
    .update(products)
    .set({ quantity: sql`${products.quantity} + ${quantity}`, updatedAt: new Date() })
    .where(eq(products.id, productId))
    .returning();
  if (!updated) throw notFound('Product');
  return updated;
}

/** weight (per piece) x quantity, as a NUMERIC string with 3 decimals. */
export function totalWeight(weightPerPiece: string, quantity: number) {
  return fromMilligrams(toMilligrams(weightPerPiece) * BigInt(quantity));
}
