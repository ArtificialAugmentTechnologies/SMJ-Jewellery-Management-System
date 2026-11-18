/**
 * Verifies the connected database: all 11 tables, their foreign keys,
 * key constraints, and a rolled-back write test.
 *
 *   npm run db:verify
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, initDb } from '../config/db.js';

export const EXPECTED_TABLES = [
  'customers',
  'gold_rates',
  'invoice_items',
  'invoices',
  'payments',
  'products',
  'stock_movements',
  'users',
  'wholesale_distribution_items',
  'wholesale_distributions',
  'wholesale_parties',
];

/** table.column -> referenced table */
const REQUIRED_FKS = [
  'gold_rates.updated_by->users', // historical rates + who set them
  'invoices.customer_id->customers', // one customer : many invoices
  'invoices.party_id->wholesale_parties',
  'invoices.gold_rate_id->gold_rates',
  'invoices.created_by->users', // one user : many invoices
  'invoice_items.invoice_id->invoices', // one invoice : many items
  'invoice_items.product_id->products',
  'stock_movements.product_id->products', // one product : many movements
  'stock_movements.from_party_id->wholesale_parties',
  'stock_movements.to_party_id->wholesale_parties',
  'stock_movements.created_by->users', // one user : many movements
  'wholesale_distributions.party_id->wholesale_parties', // one party : many distributions
  'wholesale_distributions.line_member_id->wholesale_parties',
  'wholesale_distributions.issued_by->users',
  'wholesale_distribution_items.distribution_id->wholesale_distributions', // one distribution : many products
  'wholesale_distribution_items.product_id->products',
  'payments.invoice_id->invoices', // one invoice : many payments
  'payments.received_by->users',
];

export async function verifyDb(log = console.log) {
  const db = await initDb();
  let ok = true;

  const [info] = await db.query<{ version: string; database: string; user: string }>(
    'SELECT version() AS version, current_database() AS database, current_user AS user',
  );
  log(`Connected (${db.driver}) to database "${info.database}" as "${info.user}"`);
  log(info.version.split(',')[0]);

  const tables = (
    await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
    )
  ).map((r) => r.table_name);
  log(`\nTables in public schema (${tables.length}):`);
  for (const t of tables) log(`  ${EXPECTED_TABLES.includes(t) ? '✔' : '?'} ${t}`);
  const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t));
  if (missing.length) {
    ok = false;
    log(`  ✘ Missing: ${missing.join(', ')}`);
  }

  const fks = await db.query<{ table_name: string; column_name: string; foreign_table: string; foreign_column: string }>(`
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name`);
  log(`\nForeign keys (${fks.length}):`);
  for (const fk of fks) log(`  ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table}.${fk.foreign_column}`);
  const fkSet = new Set(fks.map((f) => `${f.table_name}.${f.column_name}->${f.foreign_table}`));
  const missingFks = REQUIRED_FKS.filter((f) => !fkSet.has(f));
  if (missingFks.length) {
    ok = false;
    log(`  ✘ Missing relationships: ${missingFks.join(', ')}`);
  } else {
    log(`  ✔ All ${REQUIRED_FKS.length} required relationships present`);
  }

  const counts = await db.query<{ constraint_type: string; n: number | string }>(`
    SELECT constraint_type, count(*) AS n FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'CHECK')
      AND constraint_name NOT LIKE '%_not_null'
    GROUP BY constraint_type ORDER BY constraint_type`);
  log('\nConstraints:');
  for (const c of counts) log(`  ${c.constraint_type}: ${c.n}`);

  // Write test inside a transaction that is always rolled back.
  try {
    await db.execScript(`
      BEGIN;
      INSERT INTO customers (name, mobile_number) VALUES ('__verify__', '0000000000');
      ROLLBACK;
    `);
    log('\nWrite test (rolled back): ✔');
  } catch (err) {
    ok = false;
    log(`\nWrite test failed: ${(err as Error).message}`);
  }

  // The balance CHECK must reject sold + returned > issued.
  const [chk] = await db.query<{ def: string }>(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'wdi_balance_chk'`,
  );
  log(`Distribution balance rule: ${chk ? `✔ ${chk.def}` : '✘ missing'}`);
  if (!chk) ok = false;

  log(`\nResult: ${ok ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'}`);
  return ok;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyDb()
    .then(async (ok) => {
      await closeDb();
      process.exit(ok ? 0 : 1);
    })
    .catch(async (err) => {
      console.error('Verification failed:', err.message);
      await closeDb();
      process.exit(1);
    });
}
