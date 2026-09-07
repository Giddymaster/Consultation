import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idSchema } from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { noContent, ok } from '../../lib/http.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { getStorage } from '../../services/storage/index.js';

/**
 * Permanent deletion.
 *
 * Archiving is the default everywhere else in this platform, and deliberately
 * so: a published URL should not start returning 404, and a service someone has
 * booked is part of that booking's history. This module is the escape hatch for
 * the other case — the duplicate, the test record, the article written by
 * mistake — and it is careful about the difference.
 *
 * The rule throughout: **a record that is referenced by financial or clinical
 * history cannot be deleted.** The endpoints below check for those references
 * and refuse with a reason naming what is in the way, rather than cascading and
 * quietly taking a booking's service name with them.
 */

export async function cleanupRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Catalogue                                                              */
  /* ---------------------------------------------------------------------- */

  app.delete(
    '/admin/services/:id/permanent',
    {
      preHandler: [app.requirePermissions('services.manage', 'content.delete')],
      schema: {
        tags: ['Admin'],
        summary: 'Permanently delete an archived service',
        description:
          'Refused while any booking references the service, because a booking must keep the name of what was bought. Archive is the answer in that case.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const service = await prisma.service.findUnique({
        where: { id },
        select: { id: true, name: true, status: true, _count: { select: { bookings: true } } },
      });
      if (!service) throw notFound('Service');

      if (service.status !== 'ARCHIVED') {
        throw badRequest('Archive the service first, so it stops being offered before it is removed.');
      }
      if (service._count.bookings > 0) {
        throw badRequest(
          `This service has ${service._count.bookings} booking(s) against it and cannot be deleted. It is archived and no longer bookable.`,
        );
      }

      await prisma.service.delete({ where: { id } });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.RECORD_DELETED,
        entity: 'Service',
        entityId: id,
        metadata: { name: service.name },
      });

      return noContent(reply);
    },
  );

  app.delete(
    '/admin/products/:id/permanent',
    {
      preHandler: [app.requirePermissions('products.manage', 'content.delete')],
      schema: {
        tags: ['Admin'],
        summary: 'Permanently delete an archived product',
        description:
          'Refused while any order line references the product. Digital assets belonging to it are removed from storage.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const product = await prisma.product.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          status: true,
          digitalAsset: { select: { id: true, storageKey: true } },
          _count: { select: { orderItems: true } },
        },
      });
      if (!product) throw notFound('Product');

      if (product.status !== 'ARCHIVED') {
        throw badRequest('Archive the product first, so it leaves the shop before it is removed.');
      }
      if (product._count.orderItems > 0) {
        throw badRequest(
          `This product appears on ${product._count.orderItems} order(s) and cannot be deleted. Buyers keep their download entitlement.`,
        );
      }

      await prisma.product.delete({ where: { id } });

      // Only after the row is gone: an orphaned file is waste, a missing file
      // behind a live row is a broken download.
      if (product.digitalAsset) {
        await getStorage().delete(product.digitalAsset.storageKey).catch(() => undefined);
      }

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.RECORD_DELETED,
        entity: 'Product',
        entityId: id,
        metadata: { name: product.name, fileRemoved: Boolean(product.digitalAsset) },
      });

      return noContent(reply);
    },
  );

  app.delete(
    '/admin/articles/:id/permanent',
    {
      preHandler: [app.requirePermissions('content.delete')],
      schema: {
        tags: ['Admin'],
        summary: 'Permanently delete an archived article',
        description:
          'Only an archived article can be deleted. A published one is archived first, so the URL is retired deliberately rather than by accident.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const article = await prisma.article.findUnique({
        where: { id },
        select: { id: true, title: true, slug: true, status: true },
      });
      if (!article) throw notFound('Article');

      if (article.status !== 'ARCHIVED') {
        throw badRequest('Archive the article first. A live URL should never disappear unannounced.');
      }

      await prisma.article.delete({ where: { id } });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.RECORD_DELETED,
        entity: 'Article',
        entityId: id,
        metadata: { title: article.title, slug: article.slug },
      });

      return noContent(reply);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Reviews                                                                */
  /* ---------------------------------------------------------------------- */

  app.delete(
    '/admin/reviews/:id',
    {
      preHandler: [app.requirePermissions('reviews.moderate', 'content.delete')],
      schema: {
        tags: ['Admin'],
        summary: 'Delete a review outright',
        description:
          'For a review that should not exist at all — spam, or one naming a third party. Rejecting is the normal action and keeps the record; this removes it and recomputes the consultant’s rating.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const review = await prisma.review.findUnique({
        where: { id },
        select: { id: true, consultantId: true, rating: true, status: true },
      });
      if (!review) throw notFound('Review');

      await prisma.$transaction(async (tx) => {
        await tx.review.delete({ where: { id } });

        // The consultant's denormalised rating is derived from approved reviews,
        // so it has to be recomputed here rather than left to drift.
        const remaining = await tx.review.aggregate({
          where: { consultantId: review.consultantId, status: 'APPROVED' },
          _avg: { rating: true },
          _count: true,
        });

        await tx.consultantProfile.update({
          where: { id: review.consultantId },
          data: {
            averageRating: remaining._avg.rating
              ? Math.round(remaining._avg.rating * 10) / 10
              : null,
            reviewCount: remaining._count,
          },
        });
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.RECORD_DELETED,
        entity: 'Review',
        entityId: id,
        metadata: { consultantId: review.consultantId, status: review.status },
      });

      return noContent(reply);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Contact enquiries                                                      */
  /* ---------------------------------------------------------------------- */

  app.patch(
    '/admin/contact-messages/:id',
    {
      preHandler: [app.requirePermissions('clients.read')],
      schema: {
        tags: ['Admin'],
        summary: 'Move an enquiry through the inbox',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const { status } = z
        .object({ status: z.enum(['NEW', 'READ', 'REPLIED', 'ARCHIVED', 'SPAM']) })
        .parse(request.body);

      const existing = await prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw notFound('Message');

      const message = await prisma.contactMessage.update({ where: { id }, data: { status } });

      return ok(reply, { id: message.id, status: message.status });
    },
  );

  app.delete(
    '/admin/contact-messages/:id',
    {
      preHandler: [app.requirePermissions('clients.read', 'content.delete')],
      schema: {
        tags: ['Admin'],
        summary: 'Delete an enquiry',
        description: 'An enquiry is correspondence, not a record of account. Spam should be removable.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const existing = await prisma.contactMessage.findUnique({
        where: { id },
        select: { id: true, email: true },
      });
      if (!existing) throw notFound('Message');

      await prisma.contactMessage.delete({ where: { id } });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.RECORD_DELETED,
        entity: 'ContactMessage',
        entityId: id,
        // The address is the identifying detail; the body is not repeated here.
        metadata: { email: existing.email },
      });

      return noContent(reply);
    },
  );
}
