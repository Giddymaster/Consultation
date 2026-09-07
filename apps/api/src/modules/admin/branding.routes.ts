import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { ok } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import {
  assertUploadAllowed,
  buildStorageKey,
  getLocalDriver,
  getStorage,
} from '../../services/storage/index.js';

/**
 * Platform branding: the name, wordmark, logo and favicon.
 *
 * Text lives in the `settings` table and is edited through the settings routes.
 * The three image slots live here because they need an upload path and, more
 * importantly, a *stable public URL*: a favicon cannot be a short-lived signed
 * link, and neither can a logo that sits in an email or a cached page.
 *
 * `GET /api/branding/:asset` is that stable URL. It resolves the current storage
 * key at request time, so replacing a logo changes what the same URL serves
 * without anything else in the system needing to know the key.
 */

const ASSETS = ['logo', 'logoDark', 'favicon'] as const;
type BrandAsset = (typeof ASSETS)[number];

const assetParamSchema = z.object({ asset: z.enum(ASSETS) });

/** Only raster and vector image types. No PDFs, no archives. */
const BRAND_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

/** A logo is not a document; 2MB is generous for one. */
const MAX_BRAND_BYTES = 2 * 1024 * 1024;

interface BrandAssetRecord {
  key: string;
  mimeType: string;
  fileName: string;
  updatedAt: string;
}

const settingKeyFor = (asset: BrandAsset): string => `brand.${asset}`;

async function readAsset(asset: BrandAsset): Promise<BrandAssetRecord | null> {
  const row = await prisma.setting.findUnique({ where: { key: settingKeyFor(asset) } });
  const value = row?.value as BrandAssetRecord | null | undefined;
  return value && typeof value === 'object' && 'key' in value ? value : null;
}

/**
 * Public URLs for whatever is currently set.
 *
 * The `v` parameter is the asset's own updated-at stamp: it changes when the
 * image changes and never otherwise, which is what lets the response be cached
 * hard while still updating the moment an administrator swaps the logo.
 */
export async function brandAssetUrls(): Promise<Record<string, string | null>> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ASSETS.map(settingKeyFor) } },
  });

  const urls: Record<string, string | null> = {
    'brand.logoUrl': null,
    'brand.logoDarkUrl': null,
    'brand.faviconUrl': null,
  };

  for (const asset of ASSETS) {
    const row = rows.find((candidate) => candidate.key === settingKeyFor(asset));
    const value = row?.value as BrandAssetRecord | null | undefined;
    if (!value || typeof value !== 'object' || !('key' in value)) continue;

    const version = encodeURIComponent(String(value.updatedAt ?? ''));
    urls[`brand.${asset}Url`] = `/api/branding/${asset}?v=${version}`;
  }

  return urls;
}

export async function brandingRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Public delivery                                                        */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/branding/:asset',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['System'],
        summary: 'The current logo, dark logo or favicon',
        description:
          'Public and stable: the URL does not change when the image behind it does. Cached for a year against its version parameter, which changes on every upload.',
      },
    },
    async (request, reply) => {
      const { asset } = assetParamSchema.parse(request.params);
      const record = await readAsset(asset);
      if (!record) throw notFound('Brand asset');

      const storage = getStorage();

      // An SVG is a document that can carry script. These headers make the
      // browser treat it as an inert image: no scripts, no plugins, no
      // same-origin privileges, and no MIME sniffing into something worse.
      reply.header('Content-Type', record.mimeType);
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');

      // `getLocalDriver` is the accessor that already knows how to refuse when
      // the active driver is not local, so the name check keeps that in one place.
      if (storage.name === 'local') {
        return reply.send(getLocalDriver().openStream(record.key));
      }

      // Object storage: hand the browser a short-lived signed URL. The redirect
      // itself is not cached, so a swapped logo is picked up immediately.
      const signed = await storage.signedUrl(record.key, { ttlSeconds: 3600 });
      reply.header('Cache-Control', 'public, max-age=300');
      return reply.redirect(signed, 302);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Administration                                                         */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/admin/branding',
    {
      preHandler: [app.requirePermissions('branding.manage')],
      schema: { tags: ['Admin'], summary: 'Current brand assets', security: [{ bearerAuth: [] }] },
    },
    async (_request, reply) => {
      const [urls, records] = await Promise.all([
        brandAssetUrls(),
        Promise.all(ASSETS.map(async (asset) => [asset, await readAsset(asset)] as const)),
      ]);

      return ok(reply, {
        ...urls,
        assets: Object.fromEntries(
          records.map(([asset, record]) => [
            asset,
            record ? { fileName: record.fileName, mimeType: record.mimeType, updatedAt: record.updatedAt } : null,
          ]),
        ),
        maxBytes: MAX_BRAND_BYTES,
        acceptedTypes: [...BRAND_MIME_TYPES],
      });
    },
  );

  app.post(
    '/admin/branding/:asset',
    {
      preHandler: [app.requirePermissions('branding.manage')],
      schema: {
        tags: ['Admin'],
        summary: 'Replace a brand image',
        description: 'Multipart upload of a PNG, JPEG, WebP or SVG, 2MB or smaller.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { asset } = assetParamSchema.parse(request.params);

      const file = await request.file();
      if (!file) throw badRequest('No file was uploaded.');

      const buffer = await file.toBuffer();

      if (buffer.byteLength > MAX_BRAND_BYTES) {
        throw badRequest('Brand images must be 2MB or smaller.');
      }
      if (!BRAND_MIME_TYPES.has(file.mimetype)) {
        throw badRequest('Upload a PNG, JPEG, WebP or SVG image.');
      }

      // Reuses the shared extension and magic-number checks, so a renamed file
      // is caught here exactly as it is on a session attachment.
      assertUploadAllowed({
        fileName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: buffer.byteLength,
        head: buffer.subarray(0, 8),
      });

      const previous = await readAsset(asset);
      const key = buildStorageKey('branding', file.filename);
      const storage = getStorage();
      await storage.put(key, buffer, file.mimetype);

      const record: BrandAssetRecord = {
        key,
        mimeType: file.mimetype,
        fileName: file.filename,
        updatedAt: new Date().toISOString(),
      };

      await prisma.setting.upsert({
        where: { key: settingKeyFor(asset) },
        create: {
          key: settingKeyFor(asset),
          value: record as never,
          description: `Brand ${asset} image.`,
          // Not public: the storage key is an internal detail. The *URL* is
          // published separately by GET /api/settings/public.
          isPublic: false,
          updatedBy: user.id,
        },
        update: { value: record as never, updatedBy: user.id },
      });

      // Best effort: a stale object costs storage, not correctness.
      if (previous?.key) await storage.delete(previous.key).catch(() => undefined);

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.BRANDING_UPDATED,
        entity: 'Setting',
        entityId: settingKeyFor(asset),
        metadata: { asset, fileName: file.filename, mimeType: file.mimetype },
      });

      return ok(reply, await brandAssetUrls());
    },
  );

  app.delete(
    '/admin/branding/:asset',
    {
      preHandler: [app.requirePermissions('branding.manage')],
      schema: {
        tags: ['Admin'],
        summary: 'Remove a brand image and fall back to the built-in mark',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { asset } = assetParamSchema.parse(request.params);
      const record = await readAsset(asset);
      if (!record) throw notFound('Brand asset');

      await prisma.setting.delete({ where: { key: settingKeyFor(asset) } });
      await getStorage().delete(record.key).catch(() => undefined);

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.BRANDING_UPDATED,
        entity: 'Setting',
        entityId: settingKeyFor(asset),
        metadata: { asset, outcome: 'removed' },
      });

      return ok(reply, await brandAssetUrls());
    },
  );
}
