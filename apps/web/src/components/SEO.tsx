import { useEffect } from 'react';

import { DEFAULT_IMAGE, SITE_NAME, SITE_URL } from '@/lib/site';
import { useBrand } from '@/lib/brand';

/**
 * Document head management.
 *
 * A deliberately small implementation rather than a helmet library: this app is
 * a SPA whose crawlable content is served to bots via prerendering at deploy
 * time, so all that is needed at runtime is keeping the tab title and the
 * sharing metadata in step with the route.
 *
 * Every tag written here is tracked and removed on unmount, so navigating away
 * cannot leave a previous page's OpenGraph image attached to the next one.
 */

export interface SEOProps {
  title: string;
  description?: string;
  path?: string;
  image?: string;
  type?: 'website' | 'article' | 'product' | 'profile';
  publishedAt?: string;
  author?: string;
  noIndex?: boolean;
  /** JSON-LD structured data for rich results. */
  structuredData?: Record<string, unknown>;
}


function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string): HTMLMetaElement {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
  return element;
}

export function SEO({
  title,
  description,
  path,
  image,
  type = 'website',
  publishedAt,
  author,
  noIndex,
  structuredData,
}: SEOProps) {
  // Falls back to the compiled-in name until the settings arrive, so the tab
  // is never briefly titled with a bare page name.
  const brand = useBrand();
  const siteName = brand.loaded ? brand.name : SITE_NAME;

  useEffect(() => {
    const created: Element[] = [];
    const previousTitle = document.title;

    const fullTitle = title.includes(siteName) ? title : `${title} | ${siteName}`;
    document.title = fullTitle;

    const url = path ? `${SITE_URL}${path}` : window.location.href;
    const resolvedImage = image ?? DEFAULT_IMAGE;

    const tags: [string, 'name' | 'property', string, string][] = [
      ['meta[name="description"]', 'name', 'description', description ?? ''],
      ['meta[property="og:title"]', 'property', 'og:title', fullTitle],
      ['meta[property="og:description"]', 'property', 'og:description', description ?? ''],
      ['meta[property="og:type"]', 'property', 'og:type', type],
      ['meta[property="og:url"]', 'property', 'og:url', url],
      ['meta[property="og:image"]', 'property', 'og:image', resolvedImage],
      ['meta[property="og:site_name"]', 'property', 'og:site_name', siteName],
      ['meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image'],
      ['meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle],
      ['meta[name="twitter:description"]', 'name', 'twitter:description', description ?? ''],
      ['meta[name="twitter:image"]', 'name', 'twitter:image', resolvedImage],
    ];

    if (publishedAt) {
      tags.push(['meta[property="article:published_time"]', 'property', 'article:published_time', publishedAt]);
    }
    if (author) {
      tags.push(['meta[property="article:author"]', 'property', 'article:author', author]);
    }

    for (const [selector, attribute, key, content] of tags) {
      if (!content) continue;
      const element = upsertMeta(selector, attribute, key, content);
      created.push(element);
    }

    // Canonical URL — important because filter state lives in the query string
    // and would otherwise look like duplicate content.
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
      created.push(canonical);
    }
    canonical.href = url;

    const robots = upsertMeta('meta[name="robots"]', 'name', 'robots', noIndex ? 'noindex,nofollow' : 'index,follow');
    created.push(robots);

    let jsonLd: HTMLScriptElement | null = null;
    if (structuredData) {
      jsonLd = document.createElement('script');
      jsonLd.type = 'application/ld+json';
      jsonLd.textContent = JSON.stringify(structuredData);
      document.head.appendChild(jsonLd);
    }

    return () => {
      document.title = previousTitle;
      jsonLd?.remove();
    };
  }, [title, description, path, image, type, publishedAt, author, noIndex, structuredData, siteName]);

  return null;
}
