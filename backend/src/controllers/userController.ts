import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../config/db.js';
import { parseBody, parseId, v } from '../middleware/validate.js';
import { users } from '../models/schema.js';
import { badRequest, notFound } from '../utils/errors.js';
import { passwordSchema } from './authController.js';

const publicColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  mobileNumber: users.mobileNumber,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

const createSchema = z.object({
  name: v.name,
  email: z.string().trim().toLowerCase().pipe(z.email('Invalid email address')),
  mobile_number: v.mobile.optional().nullable(),
  role: z.enum(['admin', 'staff']),
  password: passwordSchema,
});

const updateSchema = z.object({
  name: v.name.optional(),
  mobile_number: v.mobile.optional().nullable(),
  role: z.enum(['admin', 'staff']).optional(),
  is_active: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export async function listUsers(_req: Request, res: Response) {
  const rows = await getDb().select(publicColumns).from(users).orderBy(asc(users.name));
  res.json({ data: rows });
}

export async function createUser(req: Request, res: Response) {
  const body = parseBody(createSchema, req);
  const [row] = await getDb()
    .insert(users)
    .values({
      name: body.name,
      email: body.email,
      mobileNumber: body.mobile_number ?? null,
      role: body.role,
      passwordHash: await bcrypt.hash(body.password, 12),
    })
    .returning(publicColumns);
  res.status(201).json({ data: row });
}

export async function updateUser(req: Request, res: Response) {
  const id = parseId(req);
  const body = parseBody(updateSchema, req);
  if (id === req.user!.id && (body.is_active === false || (body.role && body.role !== 'admin'))) {
    throw badRequest('cannot_demote_self', 'You cannot deactivate or demote your own account');
  }
  const [row] = await getDb()
    .update(users)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.mobile_number !== undefined && { mobileNumber: body.mobile_number }),
      ...(body.role !== undefined && { role: body.role }),
      ...(body.is_active !== undefined && { isActive: body.is_active }),
      ...(body.password !== undefined && { passwordHash: await bcrypt.hash(body.password, 12) }),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning(publicColumns);
  if (!row) throw notFound('User');
  res.json({ data: row });
}
