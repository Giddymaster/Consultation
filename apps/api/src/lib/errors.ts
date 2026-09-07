import { ERROR_CODES, type ApiErrorResponse, type ErrorCode, type FieldIssue } from '@meridian/types';

/**
 * The one error type routes and services throw. Everything else that escapes a
 * handler is treated as an unexpected fault: logged in full, reported to the
 * client as a bare INTERNAL_ERROR with a request id and nothing more.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly issues?: FieldIssue[];
  /** Structured detail for the server log only. Never serialised to a client. */
  readonly logContext?: Record<string, unknown>;
  readonly expose = true;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    options: { issues?: FieldIssue[]; logContext?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.issues = options.issues;
    this.logContext = options.logContext;
  }

  toResponse(requestId?: string): ApiErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.issues?.length ? { issues: this.issues } : {}),
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Constructors — one per situation, so call sites read as prose.             */
/* -------------------------------------------------------------------------- */

export const badRequest = (message: string, issues?: FieldIssue[]) =>
  new AppError(ERROR_CODES.VALIDATION_ERROR, message, 400, { issues });

export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);

export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(ERROR_CODES.FORBIDDEN, message, 403);

export const notFound = (what = 'Resource') =>
  new AppError(ERROR_CODES.NOT_FOUND, `${what} was not found.`, 404);

export const conflict = (code: ErrorCode, message: string) => new AppError(code, message, 409);

export const rateLimited = (message = 'Too many requests. Please try again shortly.') =>
  new AppError(ERROR_CODES.RATE_LIMITED, message, 429);

export const internal = (message = 'Something went wrong on our end.', cause?: unknown) =>
  new AppError(ERROR_CODES.INTERNAL_ERROR, message, 500, { cause });

/* --- Domain-specific ------------------------------------------------------ */

export const bookingConflict = (message = 'The selected time is no longer available.') =>
  new AppError(ERROR_CODES.BOOKING_CONFLICT, message, 409);

export const slotUnavailable = (message = 'That time is outside the consultant’s availability.') =>
  new AppError(ERROR_CODES.SLOT_UNAVAILABLE, message, 409);

export const invalidTransition = (from: string, to: string) =>
  new AppError(
    ERROR_CODES.INVALID_STATE_TRANSITION,
    `A booking cannot move from ${from.replace(/_/g, ' ').toLowerCase()} to ${to
      .replace(/_/g, ' ')
      .toLowerCase()}.`,
    409,
    { logContext: { from, to } },
  );

export const paymentAmountMismatch = (expected: number, received: number) =>
  new AppError(
    ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
    'The payment amount did not match the amount owed. Nothing has been charged to you incorrectly — our team has been alerted.',
    409,
    { logContext: { expected, received } },
  );

export const integrationNotConnected = (provider: string) =>
  new AppError(
    ERROR_CODES.INTEGRATION_NOT_CONNECTED,
    `${provider} is not connected. An administrator needs to configure it before this action can complete.`,
    503,
    { logContext: { provider } },
  );

export const integrationFailure = (provider: string, cause?: unknown) =>
  new AppError(
    ERROR_CODES.INTEGRATION_FAILURE,
    `${provider} could not complete the request. Please try again shortly.`,
    502,
    { logContext: { provider }, cause },
  );

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
