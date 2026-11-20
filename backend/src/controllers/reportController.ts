import type { Request, Response } from 'express';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseQuery, v } from '../middleware/validate.js';
import { badRequest } from '../utils/errors.js';

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(), // exclusive upper bound
  type: z.enum(['retail', 'wholesale']).optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  mobile: v.mobile.optional(),
});
type Q = z.infer<typeof querySchema>;

function dateRange(column: SQL, q: Q) {
  const f: SQL[] = [];
  if (q.from) f.push(sql`${column} >= ${q.from.toISOString()}`);
  if (q.to) f.push(sql`${column} < ${q.to.toISOString()}`);
  return f;
}

const and = (parts: SQL[]) => (parts.length ? sql.join(parts, sql` AND `) : sql`TRUE`);

const reports: Record<string, (q: Q) => SQL> = {
  'daily-sales': (q) => salesByPeriod('day', q),
  'monthly-sales': (q) => salesByPeriod('month', q),

  'retail-sales': (q) => invoiceRegister({ ...q, type: 'retail' }),
  'wholesale-sales': (q) => invoiceRegister({ ...q, type: 'wholesale' }),

  'customer-history': (q) => {
    const f = dateRange(sql`i.invoice_date`, q);
    f.push(sql`i.invoice_type = 'retail'`);
    if (q.customer_id) f.push(sql`c.id = ${q.customer_id}`);
    if (q.mobile) f.push(sql`c.mobile_number = ${q.mobile}`);
    return sql`
      SELECT c.name AS customer_name, c.mobile_number, i.invoice_number, i.invoice_date,
             ii.product_name, ii.category, ii.weight, ii.quantity, ii.gold_rate, ii.total_amount
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id
      JOIN customers c ON c.id = i.customer_id
      WHERE ${and(f)}
      ORDER BY c.name, i.invoice_date DESC, ii.id`;
  },

  'product-sales': (q) => {
    const f = dateRange(sql`i.invoice_date`, q);
    if (q.type) f.push(sql`i.invoice_type = ${q.type}`);
    return sql`
      SELECT ii.category, ii.product_name, ii.metal,
             sum(ii.quantity) AS quantity,
             sum(ii.weight * ii.quantity) AS total_weight,
             sum(ii.gold_amount) AS gold_amount,
             sum(ii.making_charges) AS making_charges,
             sum(ii.discount) AS discount,
             sum(ii.total_amount) AS total_amount
      FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
      WHERE ${and(f)}
      GROUP BY ii.category, ii.product_name, ii.metal
      ORDER BY total_amount DESC`;
  },

  'stock-inward': (q) => movementReport('inward', q),
  'stock-outward': (q) => movementReport('outward', q),
  'returned-items': (q) => movementReport('returned', q),

  'outstanding-payments': (q) => {
    const f = dateRange(sql`i.invoice_date`, q);
    f.push(sql`i.grand_total > i.amount_paid`);
    if (q.type) f.push(sql`i.invoice_type = ${q.type}`);
    return sql`
      SELECT i.invoice_number, i.invoice_type, i.invoice_date,
             COALESCE(c.name, p.name) AS name,
             COALESCE(c.mobile_number, p.mobile_number) AS mobile_number,
             i.grand_total, i.amount_paid, (i.grand_total - i.amount_paid) AS balance, i.payment_status
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN wholesale_parties p ON p.id = i.party_id
      WHERE ${and(f)}
      ORDER BY i.invoice_date`;
  },
};

function salesByPeriod(unit: 'day' | 'month', q: Q) {
  const f = dateRange(sql`invoice_date`, q);
  if (q.type) f.push(sql`invoice_type = ${q.type}`);
  // Group in Indian Standard Time so "daily" matches the shop's business day.
  const period = sql.raw(`to_char(date_trunc('${unit}', invoice_date AT TIME ZONE 'Asia/Kolkata'), '${unit === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM'}')`);
  return sql`
    SELECT ${period} AS period,
           count(*) AS invoices,
           COALESCE(sum(grand_total) FILTER (WHERE invoice_type = 'retail'), 0) AS retail_total,
           COALESCE(sum(grand_total) FILTER (WHERE invoice_type = 'wholesale'), 0) AS wholesale_total,
           sum(total_weight) AS total_weight,
           sum(discount) AS discount,
           sum(gst_amount) AS gst_amount,
           sum(grand_total) AS grand_total,
           sum(amount_paid) AS amount_paid
    FROM invoices
    WHERE ${and(f)}
    GROUP BY 1
    ORDER BY 1 DESC`;
}

function invoiceRegister(q: Q) {
  const f = dateRange(sql`i.invoice_date`, q);
  f.push(sql`i.invoice_type = ${q.type!}`);
  return sql`
    SELECT i.invoice_number, i.invoice_date,
           COALESCE(c.name, p.name) AS name,
           COALESCE(c.mobile_number, p.mobile_number) AS mobile_number,
           i.total_weight, i.gold_amount, i.making_charges, i.discount, i.gst_amount, i.grand_total,
           i.amount_paid, i.payment_status
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    LEFT JOIN wholesale_parties p ON p.id = i.party_id
    WHERE ${and(f)}
    ORDER BY i.invoice_date DESC`;
}

function movementReport(type: 'inward' | 'outward' | 'returned', q: Q) {
  const f = dateRange(sql`m.movement_date`, q);
  f.push(sql`m.movement_type = ${type}`);
  // Stock put back by editing a saved bill is not a party return.
  if (type === 'returned') f.push(sql`m.reference_type IS DISTINCT FROM 'invoice'`);
  return sql`
    SELECT m.movement_date, p.product_name, p.category, m.quantity, m.weight,
           m.unit_price, m.supplier_details,
           COALESCE(tp.name, fp.name) AS party_name,
           u.name AS recorded_by, m.remarks
    FROM stock_movements m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN wholesale_parties tp ON tp.id = m.to_party_id
    LEFT JOIN wholesale_parties fp ON fp.id = m.from_party_id
    LEFT JOIN users u ON u.id = m.created_by
    WHERE ${and(f)}
    ORDER BY m.movement_date DESC, m.id DESC`;
}

export const REPORT_NAMES = Object.keys(reports);

export async function runReport(req: Request, res: Response) {
  const name = String(req.params.report);
  const build = reports[name];
  if (!build) throw badRequest('unknown_report', `Unknown report "${name}"`);
  const q = parseQuery(querySchema, req);
  const result = await getDb().execute(sql`${build(q)} LIMIT 5000`);
  res.json({ report: name, data: result.rows });
}
