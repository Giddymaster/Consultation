import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import {
  articleListQuerySchema,
  idSchema,
  slugSchema,
  upsertArticleSchema,
  type ArticleDetailDto,
} from '@meridian/types';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { created, noContent, ok, paginated, toSkipTake } from '../../lib/http.js';
import { requireUser } from '../../plugins/auth.js';
import { AUDIT_ACTIONS, auditFromRequest } from '../../services/audit.service.js';
import { toArticleSummary } from '../serializers.js';

/**
 * Articles and journal publications.
 *
 * Author-supplied HTML is sanitised on write, not on render. Sanitising once at
 * the boundary means every consumer — the website, an RSS feed, an email digest
 * — gets safe content without having to remember to escape it.
 */

const SANITISE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'a',
    'code', 'pre', 'figure', 'figcaption', 'img', 'hr', 'br', 'table', 'thead',
    'tbody', 'tr', 'th', 'td', 'sup', 'sub',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    '*': ['id'],
  },
  // Anything not http/https/mailto — javascript: above all — is dropped.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  transformTags: {
    // External links open safely; rel prevents reverse tabnabbing.
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        ...(attribs.href?.startsWith('http')
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {}),
      },
    }),
  },
};

const ARTICLE_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true } },
} as const;

/** ~200 words per minute, floored at one. */
function estimateReadingMinutes(html: string): number {
  const words = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------------------- */
  /* Public                                                                 */
  /* ---------------------------------------------------------------------- */

  app.get(
    '/article-categories',
    { schema: { tags: ['Content'], summary: 'List article categories' } },
    async (_request, reply) => {
      const categories = await prisma.articleCategory.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: { select: { articles: { where: { status: 'PUBLISHED' } } } },
        },
      });
      return ok(
        reply,
        categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          articleCount: c._count.articles,
        })),
      );
    },
  );

  app.get(
    '/articles',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Content'],
        summary: 'List articles',
        description:
          'Anonymous callers see published articles only. A caller holding content.read may filter by status to see drafts and scheduled pieces.',
      },
    },
    async (request, reply) => {
      const query = articleListQuerySchema.parse(request.query);
      const { skip, take } = toSkipTake(query.page, query.pageSize);

      const canSeeUnpublished = request.currentUser?.permissions.includes('content.read') ?? false;

      const where = {
        // Scheduled articles stay hidden until their publish time passes, so a
        // scheduled piece cannot leak early by being fetched directly.
        ...(canSeeUnpublished && query.status
          ? { status: query.status }
          : { status: 'PUBLISHED' as const, publishedAt: { lte: new Date() } }),
        ...(query.isJournal !== undefined ? { isJournal: query.isJournal } : {}),
        ...(query.category ? { category: { slug: query.category } } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { excerpt: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const [articles, total] = await Promise.all([
        prisma.article.findMany({
          where,
          include: ARTICLE_INCLUDE,
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          skip,
          take,
        }),
        prisma.article.count({ where }),
      ]);

      return ok(
        reply,
        paginated(articles.map(toArticleSummary), total, query.page, query.pageSize),
      );
    },
  );

  app.get(
    '/articles/:slug',
    {
      preHandler: [app.optionalAuth],
      schema: { tags: ['Content'], summary: 'Article detail with related reading' },
    },
    async (request, reply) => {
      const { slug } = z.object({ slug: slugSchema }).parse(request.params);
      const canSeeUnpublished = request.currentUser?.permissions.includes('content.read') ?? false;

      const article = await prisma.article.findFirst({
        where: {
          slug,
          ...(canSeeUnpublished ? {} : { status: 'PUBLISHED', publishedAt: { lte: new Date() } }),
        },
        include: ARTICLE_INCLUDE,
      });
      if (!article) throw notFound('Article');

      // Fire-and-forget: a view counter must never fail a page load.
      void prisma.article
        .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
        .catch(() => undefined);

      const related = await prisma.article.findMany({
        where: {
          id: { not: article.id },
          status: 'PUBLISHED',
          publishedAt: { lte: new Date() },
          OR: [{ categoryId: article.categoryId }, { tags: { hasSome: article.tags } }],
        },
        include: ARTICLE_INCLUDE,
        orderBy: { publishedAt: 'desc' },
        take: 3,
      });

      const detail: ArticleDetailDto = {
        ...toArticleSummary(article),
        content: article.content,
        status: article.status,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        journalVolume: article.journalVolume,
        journalIssue: article.journalIssue,
        doi: article.doi,
        related: related.map(toArticleSummary),
      };

      return ok(reply, detail);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Authoring                                                              */
  /* ---------------------------------------------------------------------- */

  app.post(
    '/articles',
    {
      preHandler: [app.requirePermissions('content.create')],
      schema: { tags: ['Content'], summary: 'Create an article', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const input = upsertArticleSchema.parse(request.body);

      // Publishing is a separate permission from drafting.
      if (input.status === 'PUBLISHED' && !user.permissions.includes('content.publish')) {
        input.status = 'DRAFT';
      }

      const content = sanitizeHtml(input.content, SANITISE_OPTIONS);

      const article = await prisma.article.create({
        data: {
          title: input.title,
          slug: input.slug,
          categoryId: input.categoryId,
          excerpt: input.excerpt,
          content,
          tags: input.tags,
          featuredImageUrl: input.featuredImageUrl ?? null,
          authorId: input.authorId ?? user.id,
          status: input.status,
          publishedAt:
            input.status === 'PUBLISHED'
              ? (input.publishedAt ? new Date(input.publishedAt) : new Date())
              : input.publishedAt
                ? new Date(input.publishedAt)
                : null,
          readingMinutes: input.readingMinutes ?? estimateReadingMinutes(content),
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          isJournal: input.isJournal,
          journalVolume: input.journalVolume ?? null,
          journalIssue: input.journalIssue ?? null,
          doi: input.doi ?? null,
        },
        include: ARTICLE_INCLUDE,
      });

      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_CREATED,
        entity: 'Article',
        entityId: article.id,
        metadata: { slug: article.slug, status: article.status },
      });

      return created(reply, toArticleSummary(article));
    },
  );

  app.patch(
    '/articles/:id',
    {
      preHandler: [app.requirePermissions('content.create')],
      schema: { tags: ['Content'], summary: 'Update an article', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const user = requireUser(request);
      const { id } = z.object({ id: idSchema }).parse(request.params);
      const input = upsertArticleSchema.partial().parse(request.body);

      const existing = await prisma.article.findUnique({ where: { id }, select: { status: true } });
      if (!existing) throw notFound('Article');

      if (input.status === 'PUBLISHED' && !user.permissions.includes('content.publish')) {
        delete input.status;
      }

      const content = input.content ? sanitizeHtml(input.content, SANITISE_OPTIONS) : undefined;

      const article = await prisma.article.update({
        where: { id },
        data: {
          ...(input.title ? { title: input.title } : {}),
          ...(input.slug ? { slug: input.slug } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.excerpt ? { excerpt: input.excerpt } : {}),
          ...(content ? { content, readingMinutes: input.readingMinutes ?? estimateReadingMinutes(content) } : {}),
          ...(input.tags ? { tags: input.tags } : {}),
          ...(input.featuredImageUrl !== undefined ? { featuredImageUrl: input.featuredImageUrl ?? null } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.publishedAt !== undefined ? { publishedAt: input.publishedAt ? new Date(input.publishedAt) : null } : {}),
          ...(input.status === 'PUBLISHED' && !input.publishedAt ? { publishedAt: new Date() } : {}),
          ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle ?? null } : {}),
          ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription ?? null } : {}),
          ...(input.isJournal !== undefined ? { isJournal: input.isJournal } : {}),
          ...(input.journalVolume !== undefined ? { journalVolume: input.journalVolume ?? null } : {}),
          ...(input.journalIssue !== undefined ? { journalIssue: input.journalIssue ?? null } : {}),
          ...(input.doi !== undefined ? { doi: input.doi ?? null } : {}),
        },
        include: ARTICLE_INCLUDE,
      });

      const wasPublished = existing.status !== 'PUBLISHED' && article.status === 'PUBLISHED';
      await auditFromRequest(request, {
        action: wasPublished ? AUDIT_ACTIONS.CONTENT_PUBLISHED : AUDIT_ACTIONS.CONTENT_UPDATED,
        entity: 'Article',
        entityId: article.id,
        metadata: { slug: article.slug, status: article.status },
      });

      return ok(reply, toArticleSummary(article));
    },
  );

  app.delete(
    '/articles/:id',
    {
      preHandler: [app.requirePermissions('content.publish')],
      schema: {
        tags: ['Content'],
        summary: 'Archive an article',
        description: 'Archives rather than deletes, so a published URL never 404s unexpectedly.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: idSchema }).parse(request.params);

      await prisma.article.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await auditFromRequest(request, {
        action: AUDIT_ACTIONS.CONTENT_UPDATED,
        entity: 'Article',
        entityId: id,
        metadata: { status: 'ARCHIVED' },
      });

      return noContent(reply);
    },
  );
}
