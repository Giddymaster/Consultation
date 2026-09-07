import { z } from 'zod';
import { CONTENT_STATUS_VALUES, CURRENCY_VALUES } from '../enums.js';
import {
  idSchema,
  isoDateTimeSchema,
  minorAmountSchema,
  paginationSchema,
  queryBooleanSchema,
  slugSchema,
} from './common.js';

export const upsertArticleSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: slugSchema,
  excerpt: z.string().trim().min(10).max(400),
  /** Sanitised server-side before storage; never rendered as raw HTML unchecked. */
  content: z.string().min(1).max(200000),
  categoryId: idSchema,
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  featuredImageUrl: z.url().max(2048).optional(),
  authorId: idSchema.optional(),
  status: z.enum(CONTENT_STATUS_VALUES).default('DRAFT'),
  publishedAt: isoDateTimeSchema.optional(),
  seoTitle: z.string().trim().max(160).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  readingMinutes: z.number().int().min(1).max(180).optional(),
  /** Journal entries are articles flagged as peer-reviewed publications. */
  isJournal: z.boolean().default(false),
  journalVolume: z.string().trim().max(40).optional(),
  journalIssue: z.string().trim().max(40).optional(),
  doi: z.string().trim().max(120).optional(),
});
export type UpsertArticleInput = z.infer<typeof upsertArticleSchema>;

export const articleListQuerySchema = paginationSchema.extend({
  category: slugSchema.optional(),
  tag: z.string().trim().max(40).optional(),
  search: z.string().trim().max(120).optional(),
  status: z.enum(CONTENT_STATUS_VALUES).optional(),
  isJournal: queryBooleanSchema.optional(),
});

/** Product fields without cross-field rules, so updates can be partial. */
export const productFieldsSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    slug: slugSchema,
    description: z.string().trim().min(10).max(40000),
    shortDescription: z.string().trim().max(400).optional(),
    categoryId: idSchema,
    author: z.string().trim().max(160).optional(),
    coverImageUrl: z.url().max(2048).optional(),
    galleryUrls: z.array(z.url().max(2048)).max(12).default([]),
    price: minorAmountSchema,
    compareAtPrice: minorAmountSchema.optional(),
    currency: z.enum(CURRENCY_VALUES),
    sku: z.string().trim().max(64).optional(),
    type: z.enum(['DIGITAL', 'PHYSICAL']),
    /** Null means unlimited; only meaningful for PHYSICAL products. */
    stock: z.number().int().min(0).max(1_000_000).nullable().default(null),
    /** Storage key of the private asset, never a public URL. */
    digitalAssetKey: z.string().trim().max(512).optional(),
    isbn: z.string().trim().max(20).optional(),
    pages: z.number().int().min(1).max(10000).optional(),
    publishedYear: z.number().int().min(1900).max(2200).optional(),
    status: z.enum(CONTENT_STATUS_VALUES).default('DRAFT'),
    isFeatured: z.boolean().default(false),
    seoTitle: z.string().trim().max(160).optional(),
    seoDescription: z.string().trim().max(320).optional(),
  });

/** Creating a product: a digital one is not sellable without its file. */
export const upsertProductSchema = productFieldsSchema.refine(
  (v) => v.type !== 'DIGITAL' || !!v.digitalAssetKey,
  { message: 'A digital product needs an uploaded file', path: ['digitalAssetKey'] },
);
export type UpsertProductInput = z.infer<typeof upsertProductSchema>;

/**
 * Updating a product. The file requirement fires only when the request is
 * switching the product to digital, since an existing digital product already
 * has its asset and need not resend it.
 */
export const updateProductSchema = productFieldsSchema
  .partial()
  .refine((v) => v.type !== 'DIGITAL' || v.digitalAssetKey === undefined || !!v.digitalAssetKey, {
    message: 'A digital product needs an uploaded file',
    path: ['digitalAssetKey'],
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productListQuerySchema = paginationSchema.extend({
  category: slugSchema.optional(),
  type: z.enum(['DIGITAL', 'PHYSICAL']).optional(),
  search: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['newest', 'price-asc', 'price-desc', 'name']).default('newest'),
});

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: idSchema,
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1, 'Your cart is empty')
    .max(50),
  /** Required only when the cart contains a physical product. */
  shipping: z
    .object({
      fullName: z.string().trim().min(2).max(160),
      line1: z.string().trim().min(3).max(200),
      line2: z.string().trim().max(200).optional(),
      city: z.string().trim().min(2).max(100),
      region: z.string().trim().max(100).optional(),
      postalCode: z.string().trim().max(20).optional(),
      country: z.string().trim().length(2, 'Use a 2-letter country code'),
      phone: z.string().trim().min(7).max(32),
    })
    .optional(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
