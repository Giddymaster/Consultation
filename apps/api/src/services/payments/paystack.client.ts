import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, integrationsConfigured } from '../../config/env.js';
import { integrationFailure, integrationNotConnected } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/**
 * Paystack REST client.
 *
 * The secret key lives only here, server-side. The public key is the only
 * credential ever handed to a browser, and only through GET /api/settings/public.
 *
 * Amounts are passed through unchanged: Paystack expects minor units, which is
 * exactly how the platform stores money, so nothing is converted at this edge.
 */

export interface PaystackInitializeArgs {
  email: string;
  /** Minor units. Computed server-side; never taken from a request body. */
  amount: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
}

export interface PaystackInitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/** The subset of the verify payload this platform relies on. */
export interface PaystackTransaction {
  id: number;
  status: 'success' | 'failed' | 'abandoned' | 'pending' | 'processing' | 'ongoing' | 'reversed' | 'queued';
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  gateway_response: string | null;
  paid_at: string | null;
  created_at: string | null;
  fees: number | null;
  metadata: Record<string, unknown> | string | null;
  customer: { email: string; customer_code?: string } | null;
  authorization: {
    authorization_code?: string;
    last4?: string;
    card_type?: string;
    brand?: string;
    channel?: string;
  } | null;
}

export interface PaystackRefund {
  id: number;
  status: string;
  amount: number;
  currency: string;
  transaction: { id: number; reference?: string } | number;
}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

const REQUEST_TIMEOUT_MS = 20_000;

function assertConfigured(): void {
  if (!integrationsConfigured.paystack) throw integrationNotConnected('Paystack');
}

async function call<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
): Promise<T> {
  assertConfigured();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.PAYSTACK_BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: PaystackEnvelope<T>;
    try {
      payload = JSON.parse(text) as PaystackEnvelope<T>;
    } catch {
      logger.error({ path, status: response.status, body: text.slice(0, 500) }, 'Paystack returned non-JSON');
      throw integrationFailure('Paystack');
    }

    if (!response.ok || !payload.status) {
      // The message is logged but not surfaced: it can contain internal detail.
      logger.error(
        { path, status: response.status, message: payload.message },
        'Paystack request failed',
      );
      throw integrationFailure('Paystack');
    }

    return payload.data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error({ path }, 'Paystack request timed out');
      throw integrationFailure('Paystack');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function initializeTransaction(
  args: PaystackInitializeArgs,
): Promise<PaystackInitializeResponse> {
  return call<PaystackInitializeResponse>('/transaction/initialize', {
    method: 'POST',
    body: {
      email: args.email,
      amount: args.amount,
      currency: args.currency,
      reference: args.reference,
      callback_url: args.callbackUrl,
      metadata: args.metadata,
      ...(args.channels ? { channels: args.channels } : {}),
    },
  });
}

export async function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  return call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export async function createRefund(args: {
  transactionReference: string;
  /** Minor units. Omit for a full refund. */
  amount?: number;
  merchantNote?: string;
  customerNote?: string;
}): Promise<PaystackRefund> {
  return call<PaystackRefund>('/refund', {
    method: 'POST',
    body: {
      transaction: args.transactionReference,
      ...(args.amount ? { amount: args.amount } : {}),
      ...(args.merchantNote ? { merchant_note: args.merchantNote } : {}),
      ...(args.customerNote ? { customer_note: args.customerNote } : {}),
    },
  });
}

/**
 * Verifies the `x-paystack-signature` header.
 *
 * Paystack signs the **raw request body** with HMAC-SHA512 keyed on the secret
 * key. The raw bytes must be used, not a re-serialised object: JSON.stringify
 * of a parsed body can reorder keys or alter number formatting and would
 * produce a different digest for a legitimate request.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!signature || !env.PAYSTACK_SECRET_KEY) return false;

  const expected = createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('hex');

  const provided = Buffer.from(signature, 'utf8');
  const computed = Buffer.from(expected, 'utf8');
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}

/**
 * Paystack's published webhook source addresses. Used as defence in depth
 * alongside the signature check, never instead of it — an allowlisted IP with
 * a bad signature is still rejected.
 */
export const PAYSTACK_WEBHOOK_IPS = ['52.31.139.75', '52.49.173.169', '52.214.14.220'] as const;

export interface PaystackWebhookEvent {
  event: string;
  data: PaystackTransaction & Record<string, unknown>;
}
