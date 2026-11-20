import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { env } from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import { parseBody, v } from '../middleware/validate.js';
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

// ---- Mobile number + password + one-time code ---------------------------------------
// Demo mode: no SMS gateway is connected, so the code is returned in the response and the
// sign-in page displays it. Only admin numbers on the MOBILE_LOGIN_NUMBERS allowlist can request a code.
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const otps = new Map<string, { userId: number; code: string; expires: number; attempts: number }>();

const otpRequestSchema = z.object({ mobile: v.mobile });
const otpVerifySchema = z.object({ mobile: v.mobile, otp: z.string().trim().regex(/^[0-9]{6}$/, 'Enter the 6-digit code') });

export async function requestOtp(req: Request, res: Response) {
  const { mobile } = parseBody(otpRequestSchema, req);
  const [user] = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.mobileNumber, mobile), eq(users.isActive, true)))
    .orderBy(asc(users.id))
    .limit(1);
  // Only admin accounts whose number is on the MOBILE_LOGIN_NUMBERS allowlist may use mobile sign-in.
  const allowed = env.mobileLoginNumbers.includes(mobile) && user?.role === 'admin';
  if (!user || !allowed) throw new AppError(401, 'mobile_not_allowed', 'This mobile number is not registered for sign-in');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  otps.set(mobile, { userId: user.id, code, expires: Date.now() + OTP_TTL_MS, attempts: 0 });
  res.json({ otp: code, expires_in: OTP_TTL_MS / 1000, demo: true });
}

export async function verifyOtp(req: Request, res: Response) {
  const { mobile, otp } = parseBody(otpVerifySchema, req);
  const entry = otps.get(mobile);
  if (!entry || entry.expires < Date.now()) {
    otps.delete(mobile);
    throw new AppError(401, 'otp_expired', 'The code has expired. Request a new one.');
  }
  if (entry.code !== otp) {
    entry.attempts += 1;
    if (entry.attempts >= OTP_MAX_ATTEMPTS) otps.delete(mobile);
    throw new AppError(401, 'invalid_otp', 'Incorrect code');
  }
  otps.delete(mobile);
  const [user] = await getDb().select().from(users).where(eq(users.id, entry.userId));
  if (!user || !user.isActive) throw new AppError(403, 'account_inactive', 'This account has been deactivated');
  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
