import { desc, lte, sql } from 'drizzle-orm';
import type { DbOrTx } from '../config/db.js';
import { goldRates } from '../models/schema.js';

/** The latest rate whose effective date has been reached is "today's rate". */
export async function getCurrentRate(db: DbOrTx) {
  const [rate] = await db
    .select()
    .from(goldRates)
    .where(lte(goldRates.effectiveDate, sql`now()`))
    .orderBy(desc(goldRates.effectiveDate), desc(goldRates.id))
    .limit(1);
  return rate ?? null;
}
