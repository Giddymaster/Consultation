import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createOrderSchema,
  idSchema,
  productListQuerySchema,
  slugSchema,
  type ProductDetailDto,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.js';
import { created, ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import { generateReference } from '../../lib/crypto.js';
import { calculateOrderTotals } from '../../services/pricing.service.js';
import { issueDownloadUrl, verifyLocalSignature, getLocalDriver } from '../../services/storage/index.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { env } from '../../config/env.js';
import { toProductSummary } from '../serializers.js';

/**
 * Shop: catalog, checkout and entitlement-gated downloads.
 *
 * Two rules worth stating plainly:
 *
 *   • Order totals are recomputed from live product rows at checkout. The cart
 *     the browser sends carries product ids and quantities only — no prices.
 *   • A digital file is reachable only through a `DownloadEntitlement`, which
 *     is created by the payment settlement path and nowhere else. There is no
 *     endpoint that returns a raw storage key or a permanent file URL.
 */

const PRODUCT_INCLUDE = { category: { select: { id: true, name: true, slug: true } } } as const;

export async function shopRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Catalog                                                                */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/product-categories',
    { schema: { tags: ['Products'], summary: 'List product categories' } },
    async (_request, reply) => {
      const categories = await prisma.productCategory.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { products: { where: { status: 'PUBLISHED' } } } } },
      });
      return ok(
        reply,
        categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          icon: c.icon,
          productCount: c._count.products,
        })),
      );
    },
  );

  app.get(
    '/products',
    { schema: { tags: ['Products'], summary: 'List published products' } },
    async (request, reply) => {
      const query = productListQuerySchema.parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        status: 'PUBLISHED' as const,
        ...(query.category ? { category: { slug: query.category } } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.minPrice !== undefined || query.maxPrice !== undefined
          ? {
              price: {
                ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
                ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
              },
            }
          : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { author: { contains: query.search, mode: 'insensitive' as const } },
                { shortDescription: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const orderBy =
        query.sort === 'price-asc'
          ? { price: 'asc' as const }
          : query.sort === 'price-desc'
            ? { price: 'desc' as const }
            : query.sort === 'name'
              ? { name: 'asc' as const }
              : { createdAt: 'desc' as const };

      const [products, total] = await Promise.all([
        prisma.product.findMany({ where, include: PRODUCT_INCLUDE, orderBy, skip, take }),
        prisma.product.count({ where }),
      ]);

      return ok(
        reply,
        paginated(products.map(toProductSummary), total, query.page, query.pageSize),
      );
    },
  );

  app.get(
    '/products/:slug',
    { schema: { tags: ['Products'], summary: 'Product detail' } },
    async (request, reply) => {
      const { slug } = z.object({ slug: slugSchema }).parse(request.params);

      const product = await prisma.product.findFirst({
        where: { slug, status: 'PUBLISHED' },
        include: PRODUCT_INCLUDE,
      });
      if (!product) throw notFound('Product');

      const detail: ProductDetailDto = {
        ...toProductSummary(product),
        description: product.description,
        galleryUrls: product.galleryUrls,
        sku: product.sku,
        stock: product.stock,
        isbn: product.isbn,
        pages: product.pages,
        publishedYear: product.publishedYear,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
      };

      return ok(reply, detail);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Orders                                                                 */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/orders',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Orders'],
        summary: 'Create an order from a cart',
        description:
          'Prices and totals are recomputed from live product rows. The request carries product ids and quantities only.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const input = createOrderSchema.parse(request.body);

      if (input.idempotencyKey) {
        const existing = await prisma.order.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true, userId: true, reference: true, total: true, currency: true, status: true },
        });
        if (existing) {
          if (existing.userId !== user.id) throw badRequest('That request could not be processed.');
          return ok(reply, {
            orderId: existing.id,
            reference: existing.reference,
            total: existing.total,
            currency: existing.currency,
            status: existing.status,
          });
        }
      }

      const productIds = input.items.map((item) => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, status: 'PUBLISHED' },
        select: { id: true, name: true, price: true, currency: true, type: true, stock: true },
      });

      if (products.length !== new Set(productIds).size) {
        throw badRequest('One or more items are no longer available.');
      }

      const productById = new Map(products.map((p) => [p.id, p]));

      // Mixed currencies cannot be charged in one Paystack transaction.
      const currencies = new Set(products.map((p) => p.currency));
      if (currencies.size > 1) {
        throw badRequest('Items in one order must share a currency.');
      }

      const needsShipping = products.some((p) => p.type === 'PHYSICAL');
      if (needsShipping && !input.shipping) {
        throw badRequest('A delivery address is required for physical items.', [
          { path: 'shipping', message: 'Enter a delivery address' },
        ]);
      }

      // Stock is checked here and decremented inside the transaction below.
      for (const item of input.items) {
        const product = productById.get(item.productId)!;
        if (product.type === 'PHYSICAL' && product.stock !== null && product.stock < item.quantity) {
          throw new AppError(
            'OUT_OF_STOCK',
            `${product.name} does not have enough stock for that quantity.`,
            409,
          );
        }
      }

      const totals = calculateOrderTotals({
        currency: products[0]!.currency,
        items: input.items.map((item) => ({
          unitAmount: productById.get(item.productId)!.price,
          quantity: item.quantity,
        })),
      });

      const order = await prisma.$transaction(async (tx) => {
        const createdOrder = await tx.order.create({
          data: {
            reference: generateReference('ORD'),
            userId: user.id,
            status: 'PENDING_PAYMENT',
            currency: totals.currency,
            subtotal: totals.subtotal,
            tax: totals.tax,
            shipping: totals.shipping,
            total: totals.total,
            shippingAddress: (input.shipping ?? undefined) as never,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            items: {
              create: input.items.map((item) => {
                const product = productById.get(item.productId)!;
                return {
                  productId: product.id,
                  // Name and price are frozen here so a later price change
                  // never rewrites this order's history.
                  name: product.name,
                  unitAmount: product.price,
                  quantity: item.quantity,
                  amount: product.price * item.quantity,
                };
              }),
            },
          },
          select: { id: true, reference: true, total: true, currency: true, status: true },
        });

        for (const item of input.items) {
          const product = productById.get(item.productId)!;
          if (product.type === 'PHYSICAL' && product.stock !== null) {
            // Conditional decrement: two concurrent orders for the last copy
            // cannot both succeed.
            const decremented = await tx.product.updateMany({
              where: { id: product.id, stock: { gte: item.quantity } },
              data: { stock: { decrement: item.quantity } },
            });
            if (decremented.count === 0) {
              throw new AppError('OUT_OF_STOCK', `${product.name} sold out while you were checking out.`, 409);
            }
          }
        }

        return createdOrder;
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.ORDER_CREATED,
        entity: 'Order',
        entityId: order.id,
        metadata: { reference: order.reference, total: order.total, items: input.items.length },
      });

      return created(reply, order);
    },
  );

  app.get(
    '/orders',
    {
      preHandler: [app.authenticate],
      schema: { tags: ['Orders'], summary: 'List your orders', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(20),
        })
        .parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const canSeeAll = user.permissions.includes('orders.read');
      const where = canSeeAll ? {} : { userId: user.id };

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            items: { include: { product: { select: { slug: true, coverImageUrl: true, type: true } } } },
            user: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.order.count({ where }),
      ]);

      return ok(
        reply,
        paginated(
          orders.map((order) => ({
            id: order.id,
            reference: order.reference,
            status: order.status,
            currency: order.currency,
            subtotal: order.subtotal,
            tax: order.tax,
            shipping: order.shipping,
            total: order.total,
            amountPaid: order.amountPaid,
            createdAt: order.createdAt.toISOString(),
            paidAt: order.paidAt?.toISOString() ?? null,
            customer: canSeeAll
              ? `${order.user.firstName} ${order.user.lastName}`
              : undefined,
            items: order.items.map((item) => ({
              id: item.id,
              productId: item.productId,
              name: item.name,
              slug: item.product.slug,
              coverImageUrl: item.product.coverImageUrl,
              quantity: item.quantity,
              unitAmount: item.unitAmount,
              amount: item.amount,
              type: item.product.type,
              // Download links are minted on demand, never embedded in a list.
              downloadUrl: null,
            })),
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Downloads                                                              */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/my-resources',
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['Orders'],
        summary: 'Digital resources this user is entitled to',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);

      const entitlements = await prisma.downloadEntitlement.findMany({
        where: { userId: user.id },
        include: { order: { select: { reference: true, paidAt: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const productIds = entitlements.map((e) => e.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { ...PRODUCT_INCLUDE, digitalAsset: true },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      return ok(
        reply,
        entitlements.flatMap((entitlement) => {
          const product = byId.get(entitlement.productId);
          if (!product) return [];
          return [
            {
              entitlementId: entitlement.id,
              product: toProductSummary(product),
              orderReference: entitlement.order.reference,
              purchasedAt: entitlement.order.paidAt?.toISOString() ?? entitlement.createdAt.toISOString(),
              downloadCount: entitlement.downloadCount,
              fileName: product.digitalAsset?.fileName ?? null,
              sizeBytes: product.digitalAsset?.sizeBytes ?? null,
              expiresAt: entitlement.expiresAt?.toISOString() ?? null,
            },
          ];
        }),
      );
    },
  );

  app.post(
    '/downloads/:entitlementId',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
      schema: {
        tags: ['Orders'],
        summary: 'Mint a short-lived download URL',
        description:
          'Issues a signed URL that expires within minutes. The underlying storage object is never publicly addressable.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { entitlementId } = z.object({ entitlementId: idSchema }).parse(request.params);

      const entitlement = await prisma.downloadEntitlement.findUnique({
        where: { id: entitlementId },
        include: { order: { select: { status: true } } },
      });

      // Scoped by userId: an entitlement id guessed from elsewhere is a 404.
      if (!entitlement || entitlement.userId !== user.id) throw notFound('Download');

      if (entitlement.order.status !== 'PAID' && entitlement.order.status !== 'FULFILLED') {
        throw new AppError('DOWNLOAD_NOT_ENTITLED', 'This order has not been paid for.', 403);
      }
      if (entitlement.expiresAt && entitlement.expiresAt < new Date()) {
        throw new AppError('DOWNLOAD_NOT_ENTITLED', 'Access to this resource has expired.', 403);
      }
      if (entitlement.maxDownloads !== null && entitlement.downloadCount >= entitlement.maxDownloads) {
        throw new AppError(
          'DOWNLOAD_NOT_ENTITLED',
          'You have reached the download limit for this resource. Contact support if you need access again.',
          403,
        );
      }

      const asset = await prisma.digitalAsset.findUnique({
        where: { productId: entitlement.productId },
        select: { storageKey: true, fileName: true, mimeType: true },
      });
      if (!asset) throw notFound('File');

      const url = await issueDownloadUrl(asset.storageKey, { downloadAs: asset.fileName });

      await prisma.$transaction([
        prisma.downloadEntitlement.update({
          where: { id: entitlementId },
          data: { downloadCount: { increment: 1 }, lastDownloadAt: new Date() },
        }),
        prisma.digitalAsset.update({
          where: { productId: entitlement.productId },
          data: { downloadCount: { increment: 1 } },
        }),
      ]);

      return ok(reply, {
        url,
        fileName: asset.fileName,
        expiresInSeconds: env.STORAGE_SIGNED_URL_TTL,
      });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Local-driver file serving                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Serves a file for the local storage driver. The signature and expiry stamped
   * into the URL are re-verified here, so this endpoint is no weaker than an S3
   * presigned URL. Not registered when the S3 driver is active.
   */
  if (env.STORAGE_DRIVER === 'local') {
    app.get(
      '/files/download',
      { schema: { tags: ['System'], summary: 'Signed local-file download (development driver)' } },
      async (request, reply) => {
        const query = z
          .object({
            key: z.string().min(1).max(512),
            expires: z.coerce.number().int(),
            signature: z.string().min(16).max(128),
            filename: z.string().max(200).optional(),
          })
          .parse(request.query);

        if (!verifyLocalSignature(query.key, query.expires, query.signature)) {
          throw forbidden('That download link is invalid or has expired.');
        }

        const stream = getLocalDriver().openStream(query.key);
        return reply
          .header('Content-Type', 'application/octet-stream')
          .header(
            'Content-Disposition',
            `attachment; filename="${(query.filename ?? 'download').replace(/[^\w.\- ]/g, '_')}"`,
          )
          .header('Cache-Control', 'private, no-store')
          .send(stream);
      },
    );
  }
}
