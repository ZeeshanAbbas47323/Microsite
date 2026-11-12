import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'bad_request'
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'csrf_failed'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'store_suspended'
  | 'store_not_found'
  | 'store_unavailable'
  | 'out_of_stock'
  | 'service_unavailable'
  | 'internal_error';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);
export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export function zodDetails(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
}

/** Consistent `{ error: { code, message, details? } }` bodies (API spec §8). */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply.status(error.status).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: { code: 'validation_error', message: 'Invalid request', details: zodDetails(error) },
    });
  }
  const status = (error as FastifyError).statusCode;
  if (status === 429) {
    return reply
      .status(429)
      .send({ error: { code: 'rate_limited', message: 'Too many requests' } });
  }
  if (status && status >= 400 && status < 500) {
    return reply.status(status).send({ error: { code: 'bad_request', message: error.message } });
  }
  request.log.error({ err: error }, 'Unhandled error');
  return reply
    .status(500)
    .send({ error: { code: 'internal_error', message: 'Something went wrong' } });
}
