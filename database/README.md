# SMJ Jewellery – Database

PostgreSQL schema for the SMJ Jewellery Store Management System, designed for **Neon PostgreSQL**.

| File | Purpose |
|------|---------|
| `schema.sql` | Canonical schema: 11 tables, constraints, indexes, sequences. Runs standalone in the Neon SQL Editor or `psql`. |
| `seed.sql` | Optional sample data: a placeholder gold/silver rate and opening stock. Does **not** create users. |
| `../backend/migrations/*.sql` | The same schema built step by step (0001 initial, 0002 optional GST). `npm run db:migrate` applies any that are pending. |

## Tables

| # | Table | Purpose |
|---|-------|---------|
| 1 | `customers` | Retail customers. `mobile_number` is UNIQUE (10 digits), which prevents duplicates. |
| 2 | `users` | Logins. Passwords are bcrypt hashes. Role is one of `admin`, `staff`, `party`, `shopkeeper`, `line_member`. |
| 3 | `gold_rates` | Append-only rate history. The latest effective row is "today's rate". |
| 4 | `products` | Inventory. `quantity` is the pieces currently in store; `weight` is grams per piece. |
| 5 | `invoices` | Retail (→ customer) or wholesale (→ wholesale party). Rates and amounts are snapshots taken at billing time. |
| 6 | `invoice_items` | Invoice lines. `product_id` is nullable for manually entered items. |
| 7 | `wholesale_parties` | Parties, shopkeepers (owners) and line members. |
| 8 | `stock_movements` | Audit ledger of every stock change: `inward`, `outward`, `sold`, `returned`. |
| 9 | `wholesale_distributions` | Stock issued to a party, shopkeeper or line member. |
| 10 | `wholesale_distribution_items` | Per-product issued, sold and returned quantities. |
| 11 | `payments` | Payments against an invoice. Multiple payments per invoice are allowed. |

Migration bookkeeping lives in a separate schema (`smj_meta.schema_migrations`), so the `public` schema contains exactly the 11 tables above.

## Relationships

- customers 1 → N invoices
- invoices 1 → N invoice_items, and 1 → N payments
- products 1 → N stock_movements, invoice_items and wholesale_distribution_items
- wholesale_parties 1 → N wholesale_distributions, invoices and stock_movements
- wholesale_distributions 1 → N wholesale_distribution_items
- users 1 → N invoices, stock_movements, gold_rates, payments and wholesale_distributions
- invoices → gold_rates (the rate snapshot used for that bill)

## Key rules enforced by the database

- `CHECK (quantity_sold + quantity_returned <= quantity_issued)`: a party can never sell or return more than it took.
- `CHECK (products.quantity >= 0)`: stock can never go negative.
- `CHECK (grand_total = subtotal - discount + gst_amount)`, `discount = item_discount + overall_discount`, and `amount_paid <= grand_total`. GST is optional (`gst_rate` 0–28 %, 0 = no GST).
- `CHECK (total_amount = gold_amount + making_charges - discount)` on every invoice line.
- Retail invoices must reference a customer, and wholesale invoices a party (`invoices_owner_chk`).
- Money uses `NUMERIC(…, 2)`, weight uses `NUMERIC(…, 3)` in grams, and all timestamps are `TIMESTAMPTZ`.

## Commands (run from the repository root)

```powershell
npm run db:migrate          # create / upgrade the schema
npm run db:seed             # create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD
npm run db:seed -- --sample # also load seed.sql sample data
npm run db:verify           # list tables + foreign keys and run a rolled-back write test
```

To check the tables manually (Neon SQL Editor):

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```
