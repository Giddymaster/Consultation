import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env.js';

const KEY = Buffer.from(env.ENCRYPTION_KEY, 'base64');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Encrypts a secret for storage (OAuth tokens, integration credentials).
 * Output is `v1.<iv>.<tag>.<ciphertext>`, all base64url — versioned so the key
 * or algorithm can be rotated later without ambiguity about how to read a row.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split('.');
  if (version !== 'v1' || !ivPart || !tagPart || !dataPart) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Refresh and verification tokens are stored only as a hash, so a database
 * disclosure does not hand over usable session credentials.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time comparison for anything an attacker could probe by timing. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so length mismatches cost the same as a miss.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Human-quotable reference (MRD-7K4Q2X). The alphabet omits 0/O/1/I so a client
 * reading one over the phone cannot produce an ambiguous transcription.
 */
export function generateReference(prefix: string, length = 6): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `${prefix}-${out}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
