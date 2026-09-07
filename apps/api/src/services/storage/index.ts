import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHmac, randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { badRequest, internal, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/**
 * Storage abstraction over S3-compatible object storage, with a local driver
 * for development.
 *
 * Private objects — purchased books, journals, consultation attachments — are
 * never served from a public URL. Access is always a short-lived signed URL
 * minted per request, so a link copied out of the portal stops working within
 * minutes rather than being a permanent unauthenticated download.
 */

export interface StoredObject {
  key: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer | NodeJS.ReadableStream, mimeType: string): Promise<StoredObject>;
  /** A time-limited URL. `ttlSeconds` defaults to STORAGE_SIGNED_URL_TTL. */
  signedUrl(key: string, options?: { ttlSeconds?: number; downloadAs?: string }): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/* -------------------------------------------------------------------------- */
/* Upload validation                                                          */
/* -------------------------------------------------------------------------- */

/** MIME types accepted for upload, mapped to their permitted extensions. */
const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/epub+zip': ['.epub'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/zip': ['.zip'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
};

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Magic-number checks for the formats where a wrong file would matter most.
 * A declared Content-Type is attacker-controlled; the first bytes are not.
 */
const MAGIC_NUMBERS: { mime: string; bytes: number[] }[] = [
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  // ZIP container — also epub, docx, xlsx, pptx.
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
];

const ZIP_BASED = new Set([
  'application/zip',
  'application/epub+zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export function assertUploadAllowed(args: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  head?: Buffer;
}): void {
  if (args.sizeBytes > MAX_UPLOAD_BYTES) {
    throw badRequest(`Files must be ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB or smaller.`);
  }

  const allowedExtensions = ALLOWED_UPLOAD_TYPES[args.mimeType];
  if (!allowedExtensions) {
    throw badRequest(`Files of type ${args.mimeType} are not accepted.`);
  }

  const extension = args.fileName.slice(args.fileName.lastIndexOf('.')).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    throw badRequest(`The file extension ${extension} does not match its declared type.`);
  }

  // Content sniffing: catches a .exe renamed to .pdf with a forged header.
  if (args.head && args.head.length >= 4) {
    const expected = ZIP_BASED.has(args.mimeType)
      ? MAGIC_NUMBERS.find((m) => m.mime === 'application/zip')
      : MAGIC_NUMBERS.find((m) => m.mime === args.mimeType);

    if (expected) {
      const matches = expected.bytes.every((byte, index) => args.head![index] === byte);
      if (!matches) {
        throw badRequest('That file’s contents do not match its declared type.');
      }
    }
  }
}

/** Builds a collision-free storage key that reveals nothing about the uploader. */
export function buildStorageKey(prefix: string, fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  const safePrefix = prefix.replace(/[^a-z0-9/_-]/gi, '').replace(/^\/+|\/+$/g, '');
  return `${safePrefix}/${randomUUID()}${extension}`;
}

/* -------------------------------------------------------------------------- */
/* S3 driver                                                                  */
/* -------------------------------------------------------------------------- */

class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.STORAGE_REGION,
      ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY ?? '',
        secretAccessKey: env.STORAGE_SECRET_KEY ?? '',
      },
    });
  }

  async put(key: string, body: Buffer | NodeJS.ReadableStream, mimeType: string): Promise<StoredObject> {
    const buffer = Buffer.isBuffer(body) ? body : await streamToBuffer(body);
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.STORAGE_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        // Private by default; the bucket itself should also block public access.
        ACL: 'private',
      }),
    );
    return { key, sizeBytes: buffer.length, mimeType };
  }

  async signedUrl(key: string, options: { ttlSeconds?: number; downloadAs?: string } = {}): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: key,
      ...(options.downloadAs
        ? { ResponseContentDisposition: `attachment; filename="${sanitiseFileName(options.downloadAs)}"` }
        : {}),
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options.ttlSeconds ?? env.STORAGE_SIGNED_URL_TTL,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Local driver                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Filesystem driver for development. Signed URLs are HMAC-stamped links back
 * to the API, which verifies the signature and expiry before streaming — the
 * same access rules as S3, just served by us.
 */
class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';
  private root: string;

  constructor() {
    this.root = resolve(env.STORAGE_LOCAL_PATH);
  }

  /** Resolves a key inside the storage root, refusing traversal outside it. */
  private pathFor(key: string): string {
    const target = resolve(join(this.root, normalize(key)));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw badRequest('Invalid storage key.');
    }
    return target;
  }

  async put(key: string, body: Buffer | NodeJS.ReadableStream, mimeType: string): Promise<StoredObject> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });

    if (Buffer.isBuffer(body)) {
      await pipeline([body], createWriteStream(target));
      return { key, sizeBytes: body.length, mimeType };
    }

    await pipeline(body, createWriteStream(target));
    const stats = await stat(target);
    return { key, sizeBytes: stats.size, mimeType };
  }

  async signedUrl(key: string, options: { ttlSeconds?: number; downloadAs?: string } = {}): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + (options.ttlSeconds ?? env.STORAGE_SIGNED_URL_TTL);
    const signature = signLocalKey(key, expiresAt);
    const params = new URLSearchParams({ key, expires: String(expiresAt), signature });
    if (options.downloadAs) params.set('filename', options.downloadAs);
    return `${env.API_URL.replace(/\/$/, '')}/api/files/download?${params.toString()}`;
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  openStream(key: string): NodeJS.ReadableStream {
    return createReadStream(this.pathFor(key));
  }
}

export function signLocalKey(key: string, expiresAt: number): string {
  return createHmac('sha256', env.JWT_SECRET).update(`${key}:${expiresAt}`).digest('hex');
}

export function verifyLocalSignature(key: string, expiresAt: number, signature: string): boolean {
  if (expiresAt * 1000 < Date.now()) return false;
  const expected = signLocalKey(key, expiresAt);
  return expected.length === signature.length && expected === signature;
}

function sanitiseFileName(name: string): string {
  return name.replace(/[^\w.\- ]/g, '_').slice(0, 200);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

/* -------------------------------------------------------------------------- */

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver = env.STORAGE_DRIVER === 's3' ? new S3StorageDriver() : new LocalStorageDriver();
  logger.info({ driver: driver.name }, 'Storage driver initialised');
  return driver;
}

export function getLocalDriver(): LocalStorageDriver {
  const current = getStorage();
  if (!(current instanceof LocalStorageDriver)) {
    throw internal('The local storage driver is not active.');
  }
  return current;
}

/** Mints a download URL, or throws if the object is missing. */
export async function issueDownloadUrl(
  key: string,
  options: { ttlSeconds?: number; downloadAs?: string } = {},
): Promise<string> {
  const storage = getStorage();
  if (!(await storage.exists(key))) {
    logger.error({ key }, 'Requested download for a missing storage object');
    throw notFound('File');
  }
  return storage.signedUrl(key, options);
}
