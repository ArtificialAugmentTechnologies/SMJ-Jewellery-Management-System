/**
 * Creates (or re-activates) the first administrator from environment variables.
 * With --sample it also loads database/seed.sql (placeholder rate + sample stock).
 *
 *   npm run db:seed
 *   npm run db:seed -- --sample
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { closeDb, initDb } from '../config/db.js';
import { users } from '../models/schema.js';

const seedSqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../database/seed.sql');

export async function seed({ sample = false, log = console.log } = {}) {
  const handle = await initDb();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env before seeding.');
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters and contain a letter and a number.');
  }
  const [existing] = await handle.db.select().from(users).where(eq(users.email, email));
  if (existing) {
    log(`Admin user ${email} already exists - leaving the password unchanged.`);
  } else {
    await handle.db.insert(users).values({
      name,
      email,
      role: 'admin',
      passwordHash: await bcrypt.hash(password, 12),
    });
    log(`Created admin user ${email}.`);
  }
  if (sample) {
    await handle.execScript(fs.readFileSync(seedSqlPath, 'utf8'));
    log('Loaded sample data from database/seed.sql.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed({ sample: process.argv.includes('--sample') })
    .then(() => closeDb())
    .catch(async (err) => {
      console.error('Seed failed:', err.message);
      await closeDb();
      process.exit(1);
    });
}
