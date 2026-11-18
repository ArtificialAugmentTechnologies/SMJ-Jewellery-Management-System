import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { signToken } from '../middleware/auth.js';
import { parseBody } from '../middleware/validate.js';
import { users } from '../models/schema.js';
import { AppError, badRequest } from '../utils/errors.js';

// A real hash so failed lookups take as long as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', 10);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(255),
  password: z.string().min(1).max(200),
});

export async function login(req: Request, res: Response) {
  const { email, password } = parseBody(loginSchema, req);
  const [user] = await getDb().select().from(users).where(eq(users.email, email));
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
  if (!user.isActive) throw new AppError(403, 'account_inactive', 'This account has been deactivated');
  if (user.role !== 'admin' && user.role !== 'staff') {
    throw new AppError(403, 'role_not_allowed', 'This account cannot sign in to the store system');
  }
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

export async function me(req: Request, res: Response) {
  res.json({ user: req.user });
}

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: passwordSchema,
});

export async function changePassword(req: Request, res: Response) {
  const body = parseBody(changePasswordSchema, req);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.id));
  if (!(await bcrypt.compare(body.current_password, user.passwordHash))) {
    throw badRequest('wrong_password', 'Current password is incorrect');
  }
  await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(body.new_password, 12), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  res.json({ ok: true });
}
