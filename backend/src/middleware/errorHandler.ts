import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';

interface PgLikeError {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
  cause?: unknown;
}

/** Drizzle wraps driver errors; walk the cause chain to find the PostgreSQL error. */
function findPgError(err: unknown): PgLikeError | null {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as PgLikeError;
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e;
    current = e.cause;
  }
  return null;
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'route_not_found', message: `Route ${req.method} ${req.path} not found` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON' } });
  }
  const pg = findPgError(err);
  if (pg) {
    const constraint = pg.constraint ?? '';
    if (pg.code === '23505') {
      const code = constraint.includes('mobile') ? 'duplicate_mobile' : constraint.includes('email') ? 'duplicate_email' : 'duplicate';
      return res.status(409).json({ error: { code, message: 'A record with these details already exists', details: { constraint } } });
    }
    if (pg.code === '23514') {
      const code = constraint === 'wdi_balance_chk' ? 'exceeds_remaining' : constraint === 'products_quantity_chk' ? 'insufficient_stock' : 'constraint_violation';
      return res.status(400).json({ error: { code, message: `Rule violated: ${constraint}`, details: { constraint } } });
    }
    if (pg.code === '23503') {
      return res.status(409).json({ error: { code: 'in_use', message: 'This record is referenced by other records', details: { constraint } } });
    }
  }
  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
}
