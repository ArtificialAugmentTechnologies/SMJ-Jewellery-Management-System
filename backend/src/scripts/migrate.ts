/**
 * Applies pending SQL migrations from backend/migrations in filename order.
 * Applied versions are tracked in smj_meta.schema_migrations (a separate schema,
 * so the public schema contains only the 11 application tables).
 *
 *   npm run db:migrate
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDb, initDb } from '../config/db.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

export async function migrate(log = console.log) {
  const db = await initDb();
  await db.execScript(`
    CREATE SCHEMA IF NOT EXISTS smj_meta;
    CREATE TABLE IF NOT EXISTS smj_meta.schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const applied = new Set(
    (await db.query<{ version: string }>('SELECT version FROM smj_meta.schema_migrations')).map((r) => r.version),
  );
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    log(`Applying ${file} ...`);
    // One transaction per migration file: either everything applies or nothing does.
    await db.execScript(
      `BEGIN;\n${body}\nINSERT INTO smj_meta.schema_migrations (version) VALUES ('${file.replace(/'/g, "''")}');\nCOMMIT;`,
    );
    count++;
  }
  log(count ? `Applied ${count} migration(s).` : 'Database schema is up to date.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => closeDb())
    .catch(async (err) => {
      console.error('Migration failed:', err.message);
      await closeDb();
      process.exit(1);
    });
}
