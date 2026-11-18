/**
 * Application error with a stable machine-readable `code`.
 * The frontend translates codes (errors.<code>) into English / Tamil messages.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(403, 'forbidden', message);
