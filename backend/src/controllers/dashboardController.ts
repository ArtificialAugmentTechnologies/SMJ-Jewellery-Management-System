import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getDb } from '../config/db.js';
import { getCurrentRate } from '../services/goldRateService.js';

export async function summary(_req: Request, res: Response) {
  const db = getDb();
  const [counts, recent, rate, monthly] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT count(*) FROM customers)                                                   AS total_customers,
        (SELECT count(*) FROM products)                                                    AS total_products,
        (SELECT COALESCE(sum(quantity), 0) FROM products)                                  AS available_stock,
        (SELECT COALESCE(sum(weight * quantity), 0) FROM products)                         AS available_weight,
        (SELECT count(*) FROM invoices WHERE invoice_type = 'retail')                      AS retail_count,
        (SELECT count(*) FROM invoices
           WHERE invoice_date >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
                                  AT TIME ZONE 'Asia/Kolkata'))                           AS today_count,
        (SELECT COALESCE(sum(grand_total), 0) FROM invoices WHERE invoice_type = 'retail')    AS retail_total,
        (SELECT count(*) FROM invoices WHERE invoice_type = 'wholesale')                   AS wholesale_count,
        (SELECT COALESCE(sum(grand_total), 0) FROM invoices WHERE invoice_type = 'wholesale') AS wholesale_total,
        (SELECT COALESCE(sum(grand_total), 0) FROM invoices
           WHERE invoice_date >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
                                  AT TIME ZONE 'Asia/Kolkata'))                           AS today_sales,
        (SELECT COALESCE(sum(grand_total - amount_paid), 0) FROM invoices)                 AS outstanding,
        (SELECT count(*) FROM wholesale_parties WHERE is_active)                           AS active_parties
    `),
    db.execute(sql`
      SELECT i.id, i.invoice_number, i.invoice_type, i.invoice_date, i.grand_total, i.payment_status,
             COALESCE(c.name, p.name) AS owner_name,
             COALESCE(c.mobile_number, p.mobile_number) AS owner_mobile
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      LEFT JOIN wholesale_parties p ON p.id = i.party_id
      ORDER BY i.invoice_date DESC, i.id DESC
      LIMIT 8
    `),
    getCurrentRate(db),
    // Sales per calendar month (IST) for the last 12 months, newest first, including empty months.
    db.execute(sql`
      WITH months AS (
        SELECT generate_series(
                 date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - interval '11 months',
                 date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata'),
                 interval '1 month') AS m
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             COALESCE(sum(i.grand_total), 0) AS total,
             count(i.id) AS invoices
      FROM months
      LEFT JOIN invoices i
        ON i.invoice_date >= (months.m AT TIME ZONE 'Asia/Kolkata')
       AND i.invoice_date <  ((months.m + interval '1 month') AT TIME ZONE 'Asia/Kolkata')
      GROUP BY months.m
      ORDER BY months.m DESC
    `),
  ]);
  res.json({ data: { ...counts.rows[0], recentTransactions: recent.rows, currentRate: rate, monthlySales: monthly.rows } });
}
