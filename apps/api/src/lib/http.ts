import type { FastifyReply } from 'fastify';
import type { ApiSuccessResponse, PageMeta, Paginated } from '@meridian/types';

/** Every successful response carries the same envelope. */
export function ok<T>(reply: FastifyReply, data: T, statusCode = 200): FastifyReply {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return reply.status(statusCode).send(body);
}

export function created<T>(reply: FastifyReply, data: T): FastifyReply {
  return ok(reply, data, 201);
}

export function noContent(reply: FastifyReply): FastifyReply {
  return reply.status(204).send();
}

export function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, meta: pageMeta(total, page, pageSize) };
}

/** Converts a page/pageSize pair into Prisma's skip/take. */
export function toSkipTake(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
