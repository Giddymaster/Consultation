import { env } from '../../config/env.js';

/**
 * Shared email chrome.
 *
 * Written as table-based HTML with inline styles because that is what renders
 * consistently across Outlook, Gmail and Apple Mail. The palette matches the
 * web client's light theme so a confirmation email and the portal look like the
 * same product.
 */

const BRAND = {
  ink: '#111827',
  body: '#374151',
  muted: '#6b7280',
  border: '#e5e7eb',
  surface: '#ffffff',
  canvas: '#f6f7f9',
  accent: '#4f46e5',
  accentDark: '#3730a3',
  success: '#047857',
  warning: '#b45309',
} as const;

export interface EmailAction {
  label: string;
  url: string;
}

export interface DetailRow {
  label: string;
  value: string;
  emphasis?: boolean;
}

export interface LayoutOptions {
  preheader: string;
  heading: string;
  intro?: string;
  bodyHtml?: string;
  details?: DetailRow[];
  action?: EmailAction;
  secondaryAction?: EmailAction;
  footnote?: string;
  tone?: 'default' | 'success' | 'warning';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDetails(details: DetailRow[]): string {
  const rows = details
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.muted};font-size:14px;vertical-align:top;width:42%;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid ${BRAND.border};color:${BRAND.ink};font-size:14px;font-weight:${
            row.emphasis ? '600' : '500'
          };text-align:right;">
            ${escapeHtml(row.value)}
          </td>
        </tr>`,
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:collapse;">
      ${rows}
    </table>`;
}

function renderButton(action: EmailAction, variant: 'primary' | 'secondary'): string {
  const isPrimary = variant === 'primary';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 8px 12px 0;display:inline-block;">
      <tr>
        <td style="border-radius:10px;background:${isPrimary ? BRAND.accent : BRAND.surface};border:1px solid ${
          isPrimary ? BRAND.accent : BRAND.border
        };">
          <a href="${action.url}"
             style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;line-height:1;
                    color:${isPrimary ? '#ffffff' : BRAND.ink};text-decoration:none;border-radius:10px;">
            ${escapeHtml(action.label)}
          </a>
        </td>
      </tr>
    </table>`;
}

export function renderEmail(options: LayoutOptions): string {
  const accent =
    options.tone === 'success' ? BRAND.success : options.tone === 'warning' ? BRAND.warning : BRAND.accent;

  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.canvas};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;">

          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${accent},${BRAND.accentDark});"></td>
          </tr>

          <tr>
            <td style="padding:32px 32px 0;">
              <div style="font-size:15px;font-weight:700;letter-spacing:-0.01em;color:${BRAND.ink};">
                ${escapeHtml(env.BUSINESS_NAME)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 0;">
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:${BRAND.ink};">
                ${escapeHtml(options.heading)}
              </h1>
              ${
                options.intro
                  ? `<p style="margin:0;font-size:15px;line-height:1.65;color:${BRAND.body};">${escapeHtml(
                      options.intro,
                    )}</p>`
                  : ''
              }
            </td>
          </tr>

          ${
            options.bodyHtml
              ? `<tr><td style="padding:16px 32px 0;font-size:15px;line-height:1.65;color:${BRAND.body};">${options.bodyHtml}</td></tr>`
              : ''
          }

          ${
            options.details?.length
              ? `<tr><td style="padding:0 32px;">${renderDetails(options.details)}</td></tr>`
              : ''
          }

          ${
            options.action
              ? `<tr><td style="padding:8px 32px 0;">
                   ${renderButton(options.action, 'primary')}
                   ${options.secondaryAction ? renderButton(options.secondaryAction, 'secondary') : ''}
                 </td></tr>`
              : ''
          }

          ${
            options.footnote
              ? `<tr><td style="padding:20px 32px 0;font-size:13px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(
                  options.footnote,
                )}</td></tr>`
              : ''
          }

          <tr>
            <td style="padding:28px 32px 32px;">
              <div style="border-top:1px solid ${BRAND.border};padding-top:20px;font-size:12px;line-height:1.7;color:${BRAND.muted};">
                Questions? Reply to this email or contact
                <a href="mailto:${env.SUPPORT_EMAIL}" style="color:${BRAND.accent};text-decoration:none;">${
                  env.SUPPORT_EMAIL
                }</a>${env.SUPPORT_PHONE ? ` &middot; ${escapeHtml(env.SUPPORT_PHONE)}` : ''}.
                <br />
                &copy; ${year} ${escapeHtml(env.BUSINESS_NAME)}. All rights reserved.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text alternative. Some clients prefer it, and spam filters expect it. */
export function renderPlainText(options: LayoutOptions): string {
  const lines: string[] = [options.heading, ''];
  if (options.intro) lines.push(options.intro, '');
  for (const row of options.details ?? []) lines.push(`${row.label}: ${row.value}`);
  if (options.details?.length) lines.push('');
  if (options.action) lines.push(`${options.action.label}: ${options.action.url}`, '');
  if (options.secondaryAction) lines.push(`${options.secondaryAction.label}: ${options.secondaryAction.url}`, '');
  if (options.footnote) lines.push(options.footnote, '');
  lines.push(`— ${env.BUSINESS_NAME}`, env.SUPPORT_EMAIL);
  return lines.join('\n');
}

export { BRAND as EMAIL_BRAND, escapeHtml };
