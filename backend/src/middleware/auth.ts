import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { getDb } from '../config/db.js';
import { users } from '../models/schema.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export type Role = 'admin' | 'staff';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload {
  sub: string;
  role: string;
}

export function signToken(user: { id: number; role: string }) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'smj-jewellery',
  });
}

/**
 * Verifies the Bearer token and re-loads the user so that deactivated
 * accounts or changed roles take effect immediately.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_SECRET, { issuer: 'smj-jewellery' }) as TokenPayload;
  } catch {
    throw unauthorized('Session expired or invalid. Please sign in again.');
  }
  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, Number(payload.sub)));
  if (!user || !user.isActive) throw unauthorized('Account is inactive or no longer exists');
  if (user.role !== 'admin' && user.role !== 'staff') throw forbidden('This account cannot sign in to the store system');
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

export const requireAdmin = requireRole('admin');
