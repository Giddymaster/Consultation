import { Link } from 'react-router-dom';
import { useBrand } from '@/lib/brand';
import { useTheme } from '@/providers/theme-context';
import { cn } from '@/lib/utils';

/**
 * The platform's mark and wordmark.
 *
 * One component for both layouts and the auth pages, so an uploaded logo
 * appears everywhere at once rather than in whichever headers were remembered.
 *
 * With no logo configured it draws the built-in geometric mark, which is why a
 * fresh installation still looks finished. A dark-mode logo is used only when
 * one has been uploaded; otherwise the single logo serves both themes.
 */

export interface BrandMarkProps {
  className?: string;
  /** Rendered without a link, for use inside something already clickable. */
  asLink?: boolean;
  to?: string;
  /** Hides the wordmark, leaving only the mark. */
  markOnly?: boolean;
}

export function BrandMark({ className, asLink = true, to = '/', markOnly = false }: BrandMarkProps) {
  const brand = useBrand();
  const { resolved } = useTheme();

  const uploaded = resolved === 'dark' ? (brand.logoDarkUrl ?? brand.logoUrl) : brand.logoUrl;

  const content = (
    <>
      {uploaded ? (
        <img
          src={uploaded}
          alt=""
          className="size-8 shrink-0 rounded-[10px] object-contain"
          // The header reserves this box regardless, so a slow logo does not
          // shift the nav sideways as it loads.
          width={32}
          height={32}
        />
      ) : (
        <span
          aria-hidden
          className="relative flex size-8 items-center justify-center overflow-hidden rounded-[10px] bg-primary text-primary-foreground"
        >
          <span className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--aura-one))] to-[hsl(var(--aura-two))] opacity-90" />
          <svg viewBox="0 0 24 24" className="relative size-4" fill="none" stroke="white" strokeWidth="2.2">
            <path d="M4 18 L10 8 L14 14 L20 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}

      {!markOnly && <span className="text-[0.9375rem]">{brand.shortName}</span>}
    </>
  );

  const classes = cn('group inline-flex items-center gap-2.5 font-semibold tracking-tight', className);

  if (!asLink) {
    return (
      <span className={classes} aria-label={brand.name}>
        {content}
      </span>
    );
  }

  return (
    <Link to={to} className={classes} aria-label={`${brand.name} — home`}>
      {content}
    </Link>
  );
}
