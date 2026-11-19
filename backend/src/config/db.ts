import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../models/schema.js';
import { env } from './env.js';

export type Db = NodePgDatabase<typeof schema>;
/** A transaction handle has the same query API as the database handle. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

interface DbHandle {
  db: Db;
  /** Executes a multi-statement SQL script (used by the migration runner). */
  execScript: (sqlText: string) => Promise<void>;
  /** Runs a query and returns plain rows (used by verification scripts). */
  query: <T = Record<string, unknown>>(sqlText: string, params?: unknown[]) => Promise<T[]>;
  close: () => Promise<void>;
  driver: 'neon-postgres' | 'pglite';
}

let handle: DbHandle | null = null;

// Return NUMERIC columns as strings (exact) and BIGINT counts as JS numbers.
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));

async function createPgHandle(url: string): Promise<DbHandle> {
  const pool = new pg.Pool({
    connectionString: url,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
  pool.on('error', (err) => console.error('[db] idle client error', err.message));
  const db = drizzle(pool, { schema });
  return {
    db,
    driver: 'neon-postgres',
    execScript: async (sqlText) => {
      await pool.query(sqlText);
    },
    query: async (sqlText, params) => (await pool.query(sqlText, params)).rows,
    close: () => pool.end(),
  };
}

/**
 * Embedded PostgreSQL (PGlite) - used by the automated test-suite and as an
 * optional offline sandbox (`DATABASE_URL=pglite:memory` or `pglite:./.data/pg`).
 * Production always uses Neon through node-postgres.
 */
async function createPgliteHandle(url: string): Promise<DbHandle> {
  const { PGlite, types } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const location = url.slice('pglite:'.length);
  const inMemory = location === 'memory' || location === '';
  if (!inMemory) {
    const fs = await import('node:fs');
    fs.mkdirSync(location, { recursive: true });
  }
  const client = new PGlite(inMemory ? undefined : location, {
    parsers: { [types.INT8]: (v: string) => Number.parseInt(v, 10) },
  });
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  return {
    db,
    driver: 'pglite',
    execScript: async (sqlText) => {
      await client.exec(sqlText);
    },
    query: async <T>(sqlText: string, params?: unknown[]) =>
      (await client.query<T>(sqlText, params as unknown[])).rows,
    close: () => client.close(),
  };
}

export async function initDb(url = env.DATABASE_URL): Promise<DbHandle> {
  if (handle) return handle;
  handle = url.startsWith('pglite:') ? await createPgliteHandle(url) : await createPgHandle(url);
  return handle;
}

export function getDbHandle(): DbHandle {
  if (!handle) throw new Error('Database not initialised. Call initDb() first.');
  return handle;
}

export function getDb(): Db {
  return getDbHandle().db;
}

export async function closeDb() {
  if (handle) {
    await handle.close();
    handle = null;
  }
}
