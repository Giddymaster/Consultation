import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  availabilityQuerySchema,
  serviceListQuerySchema,
  slugSchema,
  type ServiceDetailDto,
  type ConsultantDetailDto,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { ok, paginated, toSkipTake } from '../../lib/http.js';
import { getAvailability } from '../../services/availability.service.js';
import { toConsultantSummary, toReviewDto, toServiceSummary } from '../serializers.js';

/**
 * Public catalog: services, consultants and availability.
 *
 * Every list here filters on `status: PUBLISHED` / `isPublished` — a draft
 * service or an unpublished consultant is invisible to anonymous callers by
 * construction, not by a UI decision.
 */

const SERVICE_INCLUDE = {
  category: true,
  durations: { orderBy: { minutes: 'asc' } },
  _count: { select: { consultants: true } },
} as const;

/** Average approved rating per service, computed in one grouped query. */
async function ratingsByService(serviceIds: string[]): Promise<Map<string, { averageRating: number | null; reviewCount: number }>> {
  if (serviceIds.length === 0) return new Map();

  const grouped = await prisma.review.groupBy({
    by: ['serviceId'],
    where: { serviceId: { in: serviceIds }, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { _all: true },
  });

  return new Map(
    grouped.map((row) => [
      row.serviceId,
      {
        averageRating: row._avg.rating ? Math.round(row._avg.rating * 10) / 10 : null,
        reviewCount: row._count._all,
      },
    ]),
  );
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Service categories                                                     */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/service-categories',
    { schema: { tags: ['Services'], summary: 'List service categories' } },
    async (_request, reply) => {
      const categories = await prisma.serviceCategory.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { services: { where: { status: 'PUBLISHED' } } } } },
      });

      return ok(
        reply,
        categories.map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          icon: category.icon,
          serviceCount: category._count.services,
        })),
      );
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Services                                                               */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/services',
    { schema: { tags: ['Services'], summary: 'List published services' } },
    async (request, reply) => {
      const query = serviceListQuerySchema.parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        status: 'PUBLISHED' as const,
        ...(query.category ? { category: { slug: query.category } } : {}),
        ...(query.featured !== undefined ? { isFeatured: query.featured } : {}),
        ...(query.consultantId ? { consultants: { some: { consultantId: query.consultantId } } } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' as const } },
                { shortDescription: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [services, total] = await Promise.all([
        prisma.service.findMany({
          where,
          include: SERVICE_INCLUDE,
          orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
          skip,
          take,
        }),
        prisma.service.count({ where }),
      ]);

      const ratings = await ratingsByService(services.map((s) => s.id));

      return ok(
        reply,
        paginated(
          services.map((service) => toServiceSummary(service, ratings.get(service.id))),
          total,
          query.page,
          query.pageSize,
        ),
      );
    },
  );

  app.get(
    '/services/:slug',
    { schema: { tags: ['Services'], summary: 'Service detail with consultants' } },
    async (request, reply) => {
      const { slug } = z.object({ slug: slugSchema }).parse(request.params);

      const service = await prisma.service.findFirst({
        where: { slug, status: 'PUBLISHED' },
        include: {
          ...SERVICE_INCLUDE,
          consultants: {
            where: { consultant: { isPublished: true } },
            include: { consultant: { include: { user: true } } },
          },
        },
      });
      if (!service) throw notFound('Service');

      const ratings = await ratingsByService([service.id]);
      const summary = toServiceSummary(service, ratings.get(service.id));

      const detail: ServiceDetailDto = {
        ...summary,
        consultantCount: service.consultants.length,
        fullDescription: service.fullDescription,
        preparationNotes: service.preparationNotes,
        cancellationPolicy: service.cancellationPolicy,
        reschedulePolicy: service.reschedulePolicy,
        cancellationWindowHours: service.cancellationWindowHours,
        rescheduleWindowHours: service.rescheduleWindowHours,
        leadTimeHours: service.leadTimeHours,
        bookingHorizonDays: service.bookingHorizonDays,
        taxRateBps: service.taxRateBps,
        depositAmount: service.depositAmount,
        depositPercentBps: service.depositPercentBps,
        status: service.status,
        seoTitle: service.seoTitle,
        seoDescription: service.seoDescription,
        consultants: service.consultants.map((link) => toConsultantSummary(link.consultant)),
      };

      return ok(reply, detail);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Consultants                                                            */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/consultants',
    { schema: { tags: ['Consultants'], summary: 'List published consultants' } },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(60).default(24),
          specialty: z.string().trim().max(80).optional(),
          serviceId: z.uuid().optional(),
          search: z.string().trim().max(120).optional(),
        })
        .parse(request.query);

      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const where = {
        isPublished: true,
        ...(query.specialty ? { specialties: { has: query.specialty } } : {}),
        ...(query.serviceId ? { services: { some: { serviceId: query.serviceId } } } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { user: { firstName: { contains: query.search, mode: 'insensitive' as const } } },
                { user: { lastName: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      };

      const [consultants, total] = await Promise.all([
        prisma.consultantProfile.findMany({
          where,
          include: { user: true },
          orderBy: [{ sortOrder: 'asc' }, { averageRating: 'desc' }],
          skip,
          take,
        }),
        prisma.consultantProfile.count({ where }),
      ]);

      return ok(
        reply,
        paginated(consultants.map(toConsultantSummary), total, query.page, query.pageSize),
      );
    },
  );

  app.get(
    '/consultants/:slug',
    { schema: { tags: ['Consultants'], summary: 'Consultant profile with services and reviews' } },
    async (request, reply) => {
      const { slug } = z.object({ slug: slugSchema }).parse(request.params);

      const consultant = await prisma.consultantProfile.findFirst({
        where: { slug, isPublished: true },
        include: {
          user: true,
          services: {
            where: { service: { status: 'PUBLISHED' } },
            include: { service: { include: SERVICE_INCLUDE } },
          },
          reviews: {
            where: { status: 'APPROVED' },
            include: {
              user: { select: { firstName: true, lastName: true } },
              service: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 12,
          },
        },
      });
      if (!consultant) throw notFound('Consultant');

      const ratings = await ratingsByService(consultant.services.map((s) => s.serviceId));

      const detail: ConsultantDetailDto = {
        ...toConsultantSummary(consultant),
        biography: consultant.biography,
        qualifications: consultant.qualifications,
        languages: consultant.languages,
        linkedinUrl: consultant.linkedinUrl,
        websiteUrl: consultant.websiteUrl,
        services: consultant.services.map((link) =>
          toServiceSummary(link.service, ratings.get(link.serviceId)),
        ),
        reviews: consultant.reviews.map((review) =>
          toReviewDto({ ...review, consultant: { user: consultant.user } }),
        ),
      };

      return ok(reply, detail);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Availability                                                           */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/availability',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['Consultants'],
        summary: 'Bookable slots for a service and consultant',
        description:
          'Computed entirely server-side from working hours, blackouts, mirrored calendar busy periods and existing bookings. The same checks re-run inside the booking transaction, so a slot returned here is still validated at submit.',
      },
    },
    async (request, reply) => {
      const query = availabilityQuerySchema.parse(request.query);
      return ok(reply, await getAvailability(query));
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Public reviews                                                         */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/reviews',
    { schema: { tags: ['Reviews'], summary: 'Approved public reviews' } },
    async (request, reply) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(50).default(12),
          consultantSlug: slugSchema.optional(),
          serviceSlug: slugSchema.optional(),
          minRating: z.coerce.number().int().min(1).max(5).optional(),
        })
        .parse(request.query);

      const { skip, take } = toSkipTake(query.page, query.pageSize);

      // Only APPROVED reviews are ever public — moderation is not advisory.
      const where = {
        status: 'APPROVED' as const,
        ...(query.consultantSlug ? { consultant: { slug: query.consultantSlug } } : {}),
        ...(query.serviceSlug ? { service: { slug: query.serviceSlug } } : {}),
        ...(query.minRating ? { rating: { gte: query.minRating } } : {}),
      };

      const [reviews, total, aggregate] = await Promise.all([
        prisma.review.findMany({
          where,
          include: {
            user: { select: { firstName: true, lastName: true } },
            service: { select: { name: true } },
            consultant: { include: { user: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.review.count({ where }),
        prisma.review.aggregate({ where, _avg: { rating: true } }),
      ]);

      return ok(reply, {
        ...paginated(reviews.map(toReviewDto), total, query.page, query.pageSize),
        averageRating: aggregate._avg.rating ? Math.round(aggregate._avg.rating * 10) / 10 : null,
      });
    },
  );
}
