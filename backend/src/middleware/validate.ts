import type { Request } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

function toAppError(error: z.ZodError) {
  const fields = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  const first = fields[0];
  return new AppError(
    400,
    'validation_error',
    first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid input',
    fields,
  );
}

export function parseBody<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw toAppError(result.error);
  return result.data;
}

export function parseQuery<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) throw toAppError(result.error);
  return result.data;
}

export function parseId(req: Request, name = 'id'): number {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'invalid_id', `Invalid ${name}`);
  return id;
}

// ---- Reusable field validators --------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    // undefined = "not provided" (keep current value on update); '' or null = clear
    .transform((v) => (v === undefined ? undefined : v ? v : null));

export const v = {
  name: z.string().trim().min(1, 'Name is required').max(150),
  mobile: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, ''))
    .pipe(z.string().regex(/^[0-9]{10}$/, 'Mobile number must be 10 digits')),
  optionalEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .optional()
    .nullable()
    .transform((s) => (s === undefined ? undefined : s ? s : null))
    .pipe(z.email('Invalid email address').nullable().optional()),
  optionalText,
  /** Non-negative decimal given as number or numeric string; returned as a string. */
  decimal: (scale: number, opts: { positive?: boolean; max?: number } = {}) =>
    z
      .union([z.number(), z.string().trim()])
      .transform((x) => String(x))
      .refine((s) => /^\d+(\.\d+)?$/.test(s), 'Must be a valid non-negative number')
      .refine((s) => (s.split('.')[1]?.length ?? 0) <= scale, `At most ${scale} decimal places`)
      .refine((s) => !opts.positive || Number(s) > 0, 'Must be greater than zero')
      .refine((s) => opts.max === undefined || Number(s) <= opts.max, `Must be at most ${opts.max}`),
  int: (min = 0, max = 1_000_000) => z.coerce.number().int().min(min).max(max),
  dateTime: z.coerce.date().optional(),
  pagination: {
    limit: z.coerce.number().int().min(1).max(500).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  },
};
