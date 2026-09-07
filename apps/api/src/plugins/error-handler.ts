import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { ERROR_CODES, type ApiErrorResponse, type FieldIssue } from '@meridian/types';
import { AppError, isAppError } from '../lib/errors.js';
import { isProduction } from '../config/env.js';

/**
 * Terminal error handling.
 *
 * Two rules, both non-negotiable:
 *   1. A client never sees a stack trace, a SQL fragment, or an internal
 *      message — unexpected faults collapse to INTERNAL_ERROR plus a request id.
 *   2. The server log always sees the whole thing.
 */

function zodToIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

function readStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const value = (error as { statusCode?: unknown }).statusCode;
    if (typeof value === 'number' && value >= 400 && value <= 599) return value;
  }
  return 500;
}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Prisma surfaces these as codes rather than typed errors we can `instanceof`. */
function mapPrismaError(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  const meta = (error as { meta?: { target?: unknown; modelName?: unknown } }).meta;

  switch (code) {
    case 'P2002': {
      const target = Array.isArray(meta?.target) ? meta.target.join(', ') : 'value';
      return new AppError(ERROR_CODES.CONFLICT, `That ${target} is already in use.`, 409, {
        logContext: { prismaCode: code, target },
      });
    }
    case 'P2025':
      return new AppError(ERROR_CODES.NOT_FOUND, 'The requested record no longer exists.', 404, {
        logContext: { prismaCode: code },
      });
    case 'P2003':
      return new AppError(
        ERROR_CODES.CONFLICT,
        'That record is referenced elsewhere and cannot be changed.',
        409,
        { logContext: { prismaCode: code } },
      );
    case 'P2034':
      return new AppError(
        ERROR_CODES.CONFLICT,
        'The request conflicted with another change. Please try again.',
        409,
        { logContext: { prismaCode: code } },
      );
    default:
      return null;
  }
}

export const errorHandlerPlugin = fp(async (app) => {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: `No route matches ${request.method} ${request.url}.`,
        requestId: request.id,
      },
    };
    return reply.status(404).send(body);
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof ZodError) {
      const appError = new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Some of the information provided needs attention.',
        400,
        { issues: zodToIssues(error) },
      );
      request.log.info({ requestId, issues: appError.issues }, 'Request failed validation');
      return reply.status(400).send(appError.toResponse(requestId));
    }

    if (isAppError(error)) {
      const logPayload = { requestId, code: error.code, ...error.logContext };
      // 5xx AppErrors are genuine faults; 4xx are expected outcomes.
      if (error.statusCode >= 500) {
        request.log.error({ ...logPayload, err: error }, error.message);
      } else {
        request.log.info(logPayload, error.message);
      }
      return reply.status(error.statusCode).send(error.toResponse(requestId));
    }

    const prismaError = mapPrismaError(error);
    if (prismaError) {
      request.log.warn({ requestId, err: error, ...prismaError.logContext }, 'Database constraint violation');
      return reply.status(prismaError.statusCode).send(prismaError.toResponse(requestId));
    }

    // Fastify's own errors (body too large, malformed JSON, rate limit…).
    // The handler receives `unknown`, so nothing is read off it unguarded.
    const statusCode = readStatusCode(error);
    if (statusCode === 429) {
      request.log.warn({ requestId, ip: request.ip }, 'Rate limit exceeded');
      return reply.status(429).send({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Too many requests. Please slow down and try again shortly.',
          requestId,
        },
      } satisfies ApiErrorResponse);
    }
    if (statusCode === 413) {
      return reply.status(413).send({
        success: false,
        error: {
          code: ERROR_CODES.UPLOAD_TOO_LARGE,
          message: 'That file is too large.',
          requestId,
        },
      } satisfies ApiErrorResponse);
    }
    if (statusCode >= 400 && statusCode < 500) {
      request.log.info({ requestId, err: error }, 'Client error');
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'The request could not be processed as sent.',
          requestId,
        },
      } satisfies ApiErrorResponse);
    }

    request.log.error({ requestId, err: error }, 'Unhandled error');

    return reply.status(500).send({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: isProduction
          ? 'Something went wrong on our end. Our team has been notified.'
          : `Internal error: ${readMessage(error)}`,
        requestId,
      },
    } satisfies ApiErrorResponse);
  });
});
