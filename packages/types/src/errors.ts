/**
 * Every API failure is returned in one envelope with a stable machine-readable
 * code. The client switches on `code`; `message` is safe to show to a user and
 * never carries a stack trace or internal detail.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  BOOKING_CONFLICT: 'BOOKING_CONFLICT',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  BOOKING_IN_PAST: 'BOOKING_IN_PAST',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  OUTSIDE_CANCELLATION_WINDOW: 'OUTSIDE_CANCELLATION_WINDOW',
  OUTSIDE_RESCHEDULE_WINDOW: 'OUTSIDE_RESCHEDULE_WINDOW',
  BOOKING_NOT_PAYABLE: 'BOOKING_NOT_PAYABLE',

  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  PAYMENT_ALREADY_SETTLED: 'PAYMENT_ALREADY_SETTLED',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
  REFUND_FAILED: 'REFUND_FAILED',

  INTEGRATION_NOT_CONNECTED: 'INTEGRATION_NOT_CONNECTED',
  INTEGRATION_FAILURE: 'INTEGRATION_FAILURE',
  MEETING_CREATION_FAILED: 'MEETING_CREATION_FAILED',

  OUT_OF_STOCK: 'OUT_OF_STOCK',
  CART_EMPTY: 'CART_EMPTY',
  DOWNLOAD_NOT_ENTITLED: 'DOWNLOAD_NOT_ENTITLED',

  UPLOAD_TOO_LARGE: 'UPLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface FieldIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** Field-level detail for form error summaries. Present on VALIDATION_ERROR. */
  issues?: FieldIssue[];
  /** Correlates a user-visible failure with the server log entry. */
  requestId?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}
