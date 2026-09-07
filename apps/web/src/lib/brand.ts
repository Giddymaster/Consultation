import { useEffect, useMemo } from 'react';
import { API_BASE } from './api';
import { usePublicSettings } from './queries';
import { SITE_NAME } from './site';

/**
 * The platform's own identity, as configured by an administrator.
 *
 * Everything here comes from `GET /api/settings/public`, with the built-in
 * values as the fallback. That matters for the first paint and for an offline
 * boot: a platform whose name is only known after a network round trip renders
 * as a blank header, so the compiled-in default stands in until the real one
 * arrives, and the two are usually identical anyway.
 *
 * `shortName` is what sits next to the mark in the header, where a long trading
 * name would wrap. It is derived rather than configured separately, because one
 * name to keep in step is enough.
 */

export interface Brand {
  name: string;
  shortName: string;
  tagline: string;
  /** Null means "no logo uploaded" — render the built-in mark instead. */
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  /** False until the real settings have arrived. */
  loaded: boolean;
}

const DEFAULT_TAGLINE = 'Clarity for your next important decision.';

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readOptional(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Brand images are served by the API, which in a split deployment is a
 * different origin. The server returns a root-relative path, so the base has to
 * be applied here — otherwise the browser asks the web host for the logo.
 */
function readAssetUrl(value: unknown): string | null {
  const path = readOptional(value);
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_BASE}${path}`;
}

export function useBrand(): Brand {
  const { data, isSuccess } = usePublicSettings();

  return useMemo(() => {
    const settings = (data ?? {}) as Record<string, unknown>;
    const name = readString(settings['business.name'], SITE_NAME);

    return {
      name,
      // "Meridian Advisory Limited" becomes "Meridian" in the header.
      shortName: name.split(/\s+/)[0] ?? name,
      tagline: readString(settings['business.tagline'], DEFAULT_TAGLINE),
      logoUrl: readAssetUrl(settings['brand.logoUrl']),
      logoDarkUrl: readAssetUrl(settings['brand.logoDarkUrl']),
      faviconUrl: readAssetUrl(settings['brand.faviconUrl']),
      email: readOptional(settings['business.email']),
      phone: readOptional(settings['business.phone']),
      address: readOptional(settings['business.address']),
      loaded: isSuccess,
    };
  }, [data, isSuccess]);
}

/**
 * Keeps the tab's favicon and title suffix in step with the configured brand.
 *
 * Mounted once, near the root. The favicon link is created if the document does
 * not already carry one, so `index.html` needs no placeholder; and it is only
 * touched when a custom icon is actually configured, so the shipped default
 * survives on an installation that never uploads one.
 */
export function useBrandDocument(brand: Brand): void {
  useEffect(() => {
    if (!brand.faviconUrl) return;

    const existing = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const link = existing ?? document.createElement('link');
    const previousHref = existing?.href ?? null;

    link.rel = 'icon';
    link.href = brand.faviconUrl;
    if (!existing) document.head.appendChild(link);

    return () => {
      // Restore rather than remove: tearing the icon out would leave the tab
      // blank while the next value is being applied.
      if (!existing) link.remove();
      else if (previousHref) link.href = previousHref;
    };
  }, [brand.faviconUrl]);

  useEffect(() => {
    if (!brand.loaded) return;
    // Only the fallback title, for the moment before a route sets its own.
    if (!document.title || document.title.endsWith('Meridian Advisory')) {
      document.title = `${brand.name} — ${brand.tagline}`;
    }
  }, [brand.loaded, brand.name, brand.tagline]);
}
