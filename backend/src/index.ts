import { env } from './config/env.js';
import { closeDb, initDb } from './config/db.js';
import { createApp } from './app.js';

async function main() {
  const handle = await initDb();
  try {
    await handle.query('SELECT 1');
  } catch (err) {
    console.error('[db] Could not connect to the database. Check DATABASE_URL in backend/.env');
    console.error((err as Error).message);
    process.exit(1);
  }
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`SMJ Jewellery API listening on http://localhost:${env.PORT} (db: ${handle.driver}, env: ${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
