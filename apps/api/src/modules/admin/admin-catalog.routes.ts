import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import {
  CONTENT_STATUS_VALUES,
  idSchema,
  slugSchema,
  updateProductSchema,
  upsertConsultantSchema,
  upsertProductSchema,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { created, noContent, ok, paginated, toSkipTake } from '../../lib/http.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { toServiceSummary } from '../serializers.js';

/**
 * Catalog management: the admin-side views of services, consultants and
 * products.
 *
 * These are separate from the public catalog routes for one reason that
 * matters: the public routes filter on `status: PUBLISHED` / `isPublished`, and
 * an editor needs to see and work on drafts. Rather than adding a "show me
 * drafts too" flag to a public endpoint — where forgetting to check the caller
 * would leak unpublished work — the privileged view is its own route behind its
 * own permission.
 */

const ADMIN_SERVICE_INCLUDE = {
  category: true,
  durations: { orderBy: { minutes: 'asc' } },
  _count: { select: { consultants: true, bookings: true } },
} as const;

export async function adminCatalogRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Services                                                               */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/services',
    {
      preHandler: [app.requirePermissions('services.read')],
      schema: {
        tags: ['Admin'],
        summary: 'List services including drafts and archived',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          status: z.enum(CONTENT_STATUS_VALUES).optional(),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);

      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
      };

      const [services, total] = await Promise.all([
        prisma.service.findMany({
          where,
          include: ADMIN_SERVICE_INCLUDE,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          skip,
          take,
        }),
        prisma.service.count({ where }),
      ]);

      return ok(
        reply,
        paginated(
          services.map((service) => ({
            ...toServiceSummary(service),
            status: service.status,
            bookingCount: service._count.bookings,
            updatedAt: service.updatedAt.toISOString(),
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  app.get(
    '/services/:id',
    {
      preHandler: [app.requirePermissions('services.manage')],
      schema: { tags: ['Admin'], summary: 'Full service record for editing', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const service = await prisma.service.findUnique({
        where: { id },
        include: {
          ...ADMIN_SERVICE_INCLUDE,
          consultants: { select: { consultantId: true } },
        },
      });
      if (!service) throw notFound('Service');

      return ok(reply, {
        id: service.id,
        name: service.name,
        slug: service.slug,
        categoryId: service.categoryId,
        shortDescription: service.shortDescription,
        fullDescription: service.fullDescription,
        currency: service.currency,
        paymentModel: service.paymentModel,
        depositAmount: service.depositAmount,
        depositPercentBps: service.depositPercentBps,
        taxRateBps: service.taxRateBps,
        meetingProviders: service.meetingProviders,
        preparationNotes: service.preparationNotes,
        cancellationPolicy: service.cancellationPolicy,
        reschedulePolicy: service.reschedulePolicy,
        cancellationWindowHours: service.cancellationWindowHours,
        rescheduleWindowHours: service.rescheduleWindowHours,
        leadTimeHours: service.leadTimeHours,
        bookingHorizonDays: service.bookingHorizonDays,
        bufferBeforeMinutes: service.bufferBeforeMinutes,
        bufferAfterMinutes: service.bufferAfterMinutes,
        status: service.status,
        isFeatured: service.isFeatured,
        sortOrder: service.sortOrder,
        heroImageUrl: service.heroImageUrl,
        icon: service.icon,
        seoTitle: service.seoTitle,
        seoDescription: service.seoDescription,
        durations: service.durations.map((duration) => ({
          minutes: duration.minutes,
          price: duration.price,
          label: duration.label,
          isDefault: duration.isDefault,
        })),
        consultantIds: service.consultants.map((link) => link.consultantId),
        bookingCount: service._count.bookings,
      });
    },
  );

  app.delete(
    '/services/:id',
    {
      preHandler: [app.requirePermissions('services.manage')],
      schema: {
        tags: ['Admin'],
        summary: 'Archive a service',
        description:
          'Archives rather than deletes. Existing bookings reference the service for their historical price and name, so removing the row would corrupt financial history.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      await prisma.service.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_UPDATED,
        entity: 'Service',
        entityId: id,
        metadata: { status: 'ARCHIVED' },
      });

      return noContent(reply);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Consultants                                                            */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/consultants',
    {
      preHandler: [app.requirePermissions('consultants.read')],
      schema: {
        tags: ['Admin'],
        summary: 'List consultants including unpublished profiles',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);

      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' as const } },
              { user: { firstName: { contains: query.search, mode: 'insensitive' as const } } },
              { user: { lastName: { contains: query.search, mode: 'insensitive' as const } } },
              { user: { email: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {};

      const [consultants, total] = await Promise.all([
        prisma.consultantProfile.findMany({
          where,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
            _count: { select: { bookings: true, services: true, availabilityRules: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          skip,
          take,
        }),
        prisma.consultantProfile.count({ where }),
      ]);

      return ok(
        reply,
        paginated(
          consultants.map((consultant) => ({
            id: consultant.id,
            userId: consultant.userId,
            slug: consultant.slug,
            fullName: `${consultant.user.firstName} ${consultant.user.lastName}`,
            email: consultant.user.email,
            avatarUrl: consultant.user.avatarUrl,
            title: consultant.title,
            specialties: consultant.specialties,
            yearsExperience: consultant.yearsExperience,
            averageRating: consultant.averageRating,
            reviewCount: consultant.reviewCount,
            completedSessions: consultant.completedSessions,
            isPublished: consultant.isPublished,
            isAcceptingBookings: consultant.isAcceptingBookings,
            timezone: consultant.timezone,
            bookingCount: consultant._count.bookings,
            serviceCount: consultant._count.services,
            // A published consultant with no working hours can never be booked;
            // the list surfaces that so it is fixable before a client hits it.
            hasAvailability: consultant._count.availabilityRules > 0,
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  app.get(
    '/consultants/:id/profile',
    {
      preHandler: [app.requirePermissions('consultants.manage')],
      schema: { tags: ['Admin'], summary: 'Full consultant record for editing', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const consultant = await prisma.consultantProfile.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          services: { select: { serviceId: true } },
        },
      });
      if (!consultant) throw notFound('Consultant');

      return ok(reply, {
        id: consultant.id,
        userId: consultant.userId,
        fullName: `${consultant.user.firstName} ${consultant.user.lastName}`,
        email: consultant.user.email,
        slug: consultant.slug,
        title: consultant.title,
        biography: consultant.biography,
        specialties: consultant.specialties,
        qualifications: consultant.qualifications,
        languages: consultant.languages,
        yearsExperience: consultant.yearsExperience,
        linkedinUrl: consultant.linkedinUrl,
        websiteUrl: consultant.websiteUrl,
        timezone: consultant.timezone,
        slotIntervalMinutes: consultant.slotIntervalMinutes,
        isAcceptingBookings: consultant.isAcceptingBookings,
        isPublished: consultant.isPublished,
        sortOrder: consultant.sortOrder,
        serviceIds: consultant.services.map((link) => link.serviceId),
      });
    },
  );

  app.post(
    '/consultants',
    {
      preHandler: [app.requirePermissions('consultants.manage')],
      schema: {
        tags: ['Admin'],
        summary: 'Create a consultant profile for an existing user',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const input = upsertConsultantSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, consultantProfile: { select: { id: true } } },
      });
      if (!user) throw badRequest('That user account does not exist.');
      if (user.consultantProfile) throw badRequest('That user already has a consultant profile.');

      const consultant = await prisma.$transaction(async (tx) => {
        const profile = await tx.consultantProfile.create({
          data: {
            userId: input.userId,
            slug: input.slug,
            title: input.title,
            biography: input.biography,
            specialties: input.specialties,
            qualifications: input.qualifications,
            languages: input.languages,
            yearsExperience: input.yearsExperience,
            linkedinUrl: input.linkedinUrl ?? null,
            websiteUrl: input.websiteUrl ?? null,
            timezone: input.timezone,
            slotIntervalMinutes: input.slotIntervalMinutes,
            isAcceptingBookings: input.isAcceptingBookings,
            isPublished: input.isPublished,
            sortOrder: input.sortOrder,
          },
          select: { id: true, slug: true },
        });

        if (input.serviceIds.length > 0) {
          await tx.serviceConsultant.createMany({
            data: input.serviceIds.map((serviceId) => ({ serviceId, consultantId: profile.id })),
            skipDuplicates: true,
          });
        }

        // A consultant profile without the CONSULTANT role could not sign in to
        // their workspace, so the role is granted as part of creating one.
        const role = await tx.role.findUnique({ where: { name: 'CONSULTANT' }, select: { id: true } });
        if (role) {
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: input.userId, roleId: role.id } },
            create: { userId: input.userId, roleId: role.id },
            update: {},
          });
        }

        return profile;
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_CREATED,
        entity: 'ConsultantProfile',
        entityId: consultant.id,
        metadata: { slug: consultant.slug },
      });

      return created(reply, consultant);
    },
  );

  app.patch(
    '/consultants/:id',
    {
      preHandler: [app.requirePermissions('consultants.manage')],
      schema: { tags: ['Admin'], summary: 'Update a consultant profile', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = upsertConsultantSchema.partial().parse(request.body);

      await prisma.$transaction(async (tx) => {
        await tx.consultantProfile.update({
          where: { id },
          data: {
            ...(input.slug ? { slug: input.slug } : {}),
            ...(input.title ? { title: input.title } : {}),
            ...(input.biography ? { biography: input.biography } : {}),
            ...(input.specialties ? { specialties: input.specialties } : {}),
            ...(input.qualifications ? { qualifications: input.qualifications } : {}),
            ...(input.languages ? { languages: input.languages } : {}),
            ...(input.yearsExperience !== undefined ? { yearsExperience: input.yearsExperience } : {}),
            ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl ?? null } : {}),
            ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl ?? null } : {}),
            ...(input.timezone ? { timezone: input.timezone } : {}),
            ...(input.slotIntervalMinutes !== undefined ? { slotIntervalMinutes: input.slotIntervalMinutes } : {}),
            ...(input.isAcceptingBookings !== undefined ? { isAcceptingBookings: input.isAcceptingBookings } : {}),
            ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          },
        });

        if (input.serviceIds) {
          await tx.serviceConsultant.deleteMany({ where: { consultantId: id } });
          if (input.serviceIds.length > 0) {
            await tx.serviceConsultant.createMany({
              data: input.serviceIds.map((serviceId) => ({ serviceId, consultantId: id })),
              skipDuplicates: true,
            });
          }
        }
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_UPDATED,
        entity: 'ConsultantProfile',
        entityId: id,
      });

      return ok(reply, { id });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Products                                                               */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/products',
    {
      preHandler: [app.requirePermissions('products.read')],
      schema: {
        tags: ['Admin'],
        summary: 'List products including drafts',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(50),
          status: z.enum(CONTENT_STATUS_VALUES).optional(),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);

      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { sku: { contains: query.search, mode: 'insensitive' as const } },
                { author: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            category: { select: { id: true, name: true, slug: true } },
            digitalAsset: { select: { fileName: true, sizeBytes: true, downloadCount: true } },
            _count: { select: { orderItems: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.product.count({ where }),
      ]);

      return ok(
        reply,
        paginated(
          products.map((product) => ({
            id: product.id,
            name: product.name,
            slug: product.slug,
            sku: product.sku,
            author: product.author,
            category: product.category,
            price: product.price,
            currency: product.currency,
            type: product.type,
            stock: product.stock,
            status: product.status,
            isFeatured: product.isFeatured,
            coverImageUrl: product.coverImageUrl,
            unitsSold: product._count.orderItems,
            fileName: product.digitalAsset?.fileName ?? null,
            downloadCount: product.digitalAsset?.downloadCount ?? 0,
            updatedAt: product.updatedAt.toISOString(),
          })),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  app.get(
    '/products/:id',
    {
      preHandler: [app.requirePermissions('products.manage')],
      schema: { tags: ['Admin'], summary: 'Full product record for editing', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const product = await prisma.product.findUnique({
        where: { id },
        include: { digitalAsset: true },
      });
      if (!product) throw notFound('Product');

      return ok(reply, {
        ...product,
        // The storage key is an internal locator, not something an editor
        // needs; the file name is what identifies the asset to a human.
        digitalAssetKey: product.digitalAsset?.storageKey ?? null,
        fileName: product.digitalAsset?.fileName ?? null,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      });
    },
  );

  app.post(
    '/products',
    {
      preHandler: [app.requirePermissions('products.manage')],
      schema: { tags: ['Admin'], summary: 'Create a product', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const input = upsertProductSchema.parse(request.body);
      const description = sanitizeProductHtml(input.description);

      const product = await prisma.product.create({
        data: {
          name: input.name,
          slug: input.slug,
          categoryId: input.categoryId,
          description,
          shortDescription: input.shortDescription ?? null,
          author: input.author ?? null,
          coverImageUrl: input.coverImageUrl ?? null,
          galleryUrls: input.galleryUrls,
          price: input.price,
          compareAtPrice: input.compareAtPrice ?? null,
          currency: input.currency,
          sku: input.sku ?? null,
          type: input.type,
          stock: input.type === 'DIGITAL' ? null : input.stock,
          isbn: input.isbn ?? null,
          pages: input.pages ?? null,
          publishedYear: input.publishedYear ?? null,
          status: input.status,
          isFeatured: input.isFeatured,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          ...(input.digitalAssetKey
            ? {
                digitalAsset: {
                  create: {
                    storageKey: input.digitalAssetKey,
                    fileName: input.digitalAssetKey.split('/').pop() ?? 'download',
                    mimeType: 'application/octet-stream',
                    sizeBytes: 0,
                  },
                },
              }
            : {}),
        },
        select: { id: true, slug: true },
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_CREATED,
        entity: 'Product',
        entityId: product.id,
        metadata: { slug: product.slug },
      });

      return created(reply, product);
    },
  );

  app.patch(
    '/products/:id',
    {
      preHandler: [app.requirePermissions('products.manage')],
      schema: { tags: ['Admin'], summary: 'Update a product', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = updateProductSchema.parse(request.body);

      const product = await prisma.product.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.slug ? { slug: input.slug } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.description ? { description: sanitizeProductHtml(input.description) } : {}),
          ...(input.shortDescription !== undefined ? { shortDescription: input.shortDescription ?? null } : {}),
          ...(input.author !== undefined ? { author: input.author ?? null } : {}),
          ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl ?? null } : {}),
          ...(input.galleryUrls ? { galleryUrls: input.galleryUrls } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice ?? null } : {}),
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.sku !== undefined ? { sku: input.sku ?? null } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.stock !== undefined ? { stock: input.stock } : {}),
          ...(input.isbn !== undefined ? { isbn: input.isbn ?? null } : {}),
          ...(input.pages !== undefined ? { pages: input.pages ?? null } : {}),
          ...(input.publishedYear !== undefined ? { publishedYear: input.publishedYear ?? null } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
          ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle ?? null } : {}),
          ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription ?? null } : {}),
        },
        select: { id: true, slug: true },
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_UPDATED,
        entity: 'Product',
        entityId: id,
      });

      return ok(reply, product);
    },
  );

  app.delete(
    '/products/:id',
    {
      preHandler: [app.requirePermissions('products.manage')],
      schema: {
        tags: ['Admin'],
        summary: 'Archive a product',
        description:
          'Archives rather than deletes: order items reference the product, and existing download entitlements must keep working.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);
      await prisma.product.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_UPDATED,
        entity: 'Product',
        entityId: id,
        metadata: { status: 'ARCHIVED' },
      });
      return noContent(reply);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Articles                                                               */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/articles/:id',
    {
      preHandler: [app.requirePermissions('content.read')],
      schema: {
        tags: ['Admin'],
        summary: 'Full article record for editing, addressed by id',
        description:
          'The public article route is addressed by slug, which is the right identity for a URL but the wrong one for an editor: a draft may not have a settled slug, and changing a slug must not change which record is being edited.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      const article = await prisma.article.findUnique({
        where: { id },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          author: { select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true } },
        },
      });
      if (!article) throw notFound('Article');

      return ok(reply, {
        id: article.id,
        title: article.title,
        slug: article.slug,
        categoryId: article.categoryId,
        category: article.category,
        excerpt: article.excerpt,
        content: article.content,
        tags: article.tags,
        featuredImageUrl: article.featuredImageUrl,
        authorId: article.authorId,
        author: article.author
          ? {
              id: article.author.id,
              fullName: `${article.author.firstName} ${article.author.lastName}`,
              title: article.author.jobTitle,
              avatarUrl: article.author.avatarUrl,
            }
          : null,
        status: article.status,
        publishedAt: article.publishedAt?.toISOString() ?? null,
        readingMinutes: article.readingMinutes,
        viewCount: article.viewCount,
        isJournal: article.isJournal,
        journalVolume: article.journalVolume,
        journalIssue: article.journalIssue,
        doi: article.doi,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        updatedAt: article.updatedAt.toISOString(),
      });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Category management                                                    */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/service-categories',
    {
      preHandler: [app.requirePermissions('services.manage')],
      schema: { tags: ['Admin'], summary: 'Create a service category', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const input = z
        .object({
          name: z.string().trim().min(2).max(120),
          slug: slugSchema,
          description: z.string().trim().max(500).optional(),
          icon: z.string().trim().max(60).optional(),
          sortOrder: z.number().int().min(0).max(999).default(0),
        })
        .parse(request.body);

      const category = await prisma.serviceCategory.create({
        data: {
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          icon: input.icon ?? null,
          sortOrder: input.sortOrder,
        },
        select: { id: true, name: true, slug: true },
      });

      return created(reply, category);
    },
  );
}

/**
 * Product descriptions are author-supplied HTML and are sanitised on write, so
 * every consumer — the shop page, an email, a feed — renders safe markup
 * without having to remember to escape it.
 */
function sanitizeProductHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'a', 'br'],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
      }),
    },
  });
}
