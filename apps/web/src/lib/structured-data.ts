/**
 * schema.org builders for the pages that carry structured data.
 *
 * These sit outside `components/SEO.tsx` because they are plain functions, and a
 * module exporting both components and non-components loses React Fast Refresh:
 * editing a builder would remount every page using `SEO` rather than hot-swapping
 * it.
 */

import { SITE_NAME, SITE_URL } from './site';

export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'Strategy, finance and operations advisory for organisations at an inflection point.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Riverside Square, Riverside Drive',
      addressLocality: 'Nairobi',
      addressCountry: 'KE',
    },
    telephone: '+254 20 271 4400',
    email: 'hello@meridianadvisory.co.ke',
  };
}

export function serviceSchema(service: {
  name: string;
  slug: string;
  shortDescription: string;
  startingPrice: number;
  currency: string;
  averageRating: number | null;
  reviewCount: number;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.shortDescription,
    url: `${SITE_URL}/services/${service.slug}`,
    provider: { '@type': 'Organization', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      price: (service.startingPrice / 100).toFixed(2),
      priceCurrency: service.currency,
    },
    ...(service.averageRating && service.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: service.averageRating,
            reviewCount: service.reviewCount,
          },
        }
      : {}),
  };
}

export function articleSchema(article: {
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string | null;
  authorName?: string;
  isJournal: boolean;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': article.isJournal ? 'ScholarlyArticle' : 'Article',
    headline: article.title,
    description: article.excerpt,
    url: `${SITE_URL}/${article.isJournal ? 'journal' : 'insights'}/${article.slug}`,
    datePublished: article.publishedAt,
    author: article.authorName ? { '@type': 'Person', name: article.authorName } : undefined,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  };
}

export function productSchema(product: {
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  inStock: boolean;
  author: string | null;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description.replace(/<[^>]*>/g, '').slice(0, 400),
    url: `${SITE_URL}/shop/${product.slug}`,
    ...(product.author ? { author: { '@type': 'Person', name: product.author } } : {}),
    offers: {
      '@type': 'Offer',
      price: (product.price / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
