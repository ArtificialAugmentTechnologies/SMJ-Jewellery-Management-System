import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
// backend/.env takes priority, then the repository root .env.
// Variables already present in the process environment are never overridden.
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '../../../.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required (Neon connection string). See .env.example.' })
    .min(1, 'DATABASE_URL is required (Neon connection string). See .env.example.'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Mobile numbers allowed to sign in with mobile + OTP (comma-separated). Empty = mobile sign-in disabled.
  MOBILE_LOGIN_NUMBERS: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n[config] Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nCopy .env.example to backend/.env and fill in the values.\n');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  mobileLoginNumbers: parsed.data.MOBILE_LOGIN_NUMBERS.split(',')
    .map((n) => n.replace(/D/g, '').slice(-10))
    .filter((n) => n.length === 10),
  isProduction: parsed.data.NODE_ENV === 'production',
};
