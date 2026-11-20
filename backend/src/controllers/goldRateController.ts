import type { Request, Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseBody, parseQuery, v } from '../middleware/validate.js';
import { goldRates, users } from '../models/schema.js';
import { getCurrentRate } from '../services/goldRateService.js';
import { badRequest } from '../utils/errors.js';

const createSchema = z.object({
  // Optional: when left out, the latest gold rate is carried forward (silver is the daily rate).
  gold_rate_per_gram: v.decimal(2, { positive: true, max: 10_000_000 }).optional().nullable(),
  silver_rate_per_gram: v.decimal(2, { positive: true, max: 10_000_000 }),
  effective_date: v.dateTime,
});

export async function currentRate(_req: Request, res: Response) {
  const rate = await getCurrentRate(getDb());
  let updatedByName: string | null = null;
  if (rate?.updatedBy) {
    const [u] = await getDb().select({ name: users.name }).from(users).where(eq(users.id, rate.updatedBy));
    updatedByName = u?.name ?? null;
  }
  res.json({ data: rate ? { ...rate, updatedByName } : null });
}

export async function rateHistory(req: Request, res: Response) {
  const { limit, offset } = parseQuery(z.object(v.pagination), req);
  const rows = await getDb()
    .select({
      id: goldRates.id,
      goldRatePerGram: goldRates.goldRatePerGram,
      silverRatePerGram: goldRates.silverRatePerGram,
      effectiveDate: goldRates.effectiveDate,
      createdAt: goldRates.createdAt,
      updatedByName: users.name,
    })
    .from(goldRates)
    .leftJoin(users, eq(users.id, goldRates.updatedBy))
    .orderBy(desc(goldRates.effectiveDate), desc(goldRates.id))
    .limit(limit)
    .offset(offset);
  res.json({ data: rows });
}

/** Rates are append-only: an update inserts a new row, so old invoices keep their rate. */
export async function createRate(req: Request, res: Response) {
  const body = parseBody(createSchema, req);
  let gold = body.gold_rate_per_gram;
  if (!gold) {
    const current = await getCurrentRate(getDb());
    if (!current) throw badRequest('gold_rate_required', 'Enter the gold rate. There is no earlier gold rate to carry forward.');
    gold = current.goldRatePerGram;
  }
  const [row] = await getDb()
    .insert(goldRates)
    .values({
      goldRatePerGram: gold,
      silverRatePerGram: body.silver_rate_per_gram,
      effectiveDate: body.effective_date ?? new Date(),
      updatedBy: req.user!.id,
    })
    .returning();
  res.status(201).json({ data: row });
}
