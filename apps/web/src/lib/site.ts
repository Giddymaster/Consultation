/**
 * Site identity, in one place.
 *
 * Both the document-head component and the schema.org builders need these, and
 * they live here rather than in either of them so that neither has to import
 * from the other.
 */

export const SITE_NAME = 'Meridian Advisory';

export const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://meridianadvisory.co.ke';

export const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;
