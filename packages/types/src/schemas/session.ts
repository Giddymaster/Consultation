import { z } from 'zod';
import { idSchema, isoDateTimeSchema, paginationSchema } from './common.js';

/**
 * Structured consultation record. `privateNotes` is the only field the client
 * API must never return; it is stripped by the session serialiser rather than
 * relied on being absent from a `select`.
 */
export const sessionNoteSchema = z.object({
  objective: z.string().trim().max(4000).optional(),
  discussionSummary: z.string().trim().max(20000).optional(),
  keyFindings: z.string().trim().max(20000).optional(),
  recommendations: z.string().trim().max(20000).optional(),
  actionItems: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        owner: z.enum(['CLIENT', 'CONSULTANT']).default('CLIENT'),
        dueDate: z.iso.date().optional(),
        completed: z.boolean().default(false),
      }),
    )
    .max(50)
    .default([]),
  followUpDate: z.iso.date().optional(),
  /** Consultant-only. Excluded from every client-facing response. */
  privateNotes: z.string().trim().max(20000).optional(),
  /** Explicit gate: the client sees the shared fields only once this is true. */
  sharedWithClient: z.boolean().default(false),
});
export type SessionNoteInput = z.infer<typeof sessionNoteSchema>;

export const sessionListQuerySchema = paginationSchema.extend({
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  consultantId: idSchema.optional(),
  clientId: idSchema.optional(),
  /** Narrows to the session belonging to one booking, if it has one yet. */
  bookingId: idSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export const createReviewSchema = z.object({
  bookingId: idSchema,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(160).optional(),
  body: z.string().trim().min(10, 'Tell us a little more').max(4000),
  serviceRating: z.number().int().min(1).max(5).optional(),
  consultantRating: z.number().int().min(1).max(5).optional(),
  communicationRating: z.number().int().min(1).max(5).optional(),
  valueRating: z.number().int().min(1).max(5).optional(),
  displayName: z.string().trim().max(120).optional(),
  isAnonymous: z.boolean().default(false),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const moderateReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  moderationNote: z.string().trim().max(1000).optional(),
});
