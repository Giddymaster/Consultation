# Meridian Advisory — Implementation Plan

Enterprise consultation booking, client portal & management platform.

## Architecture Decision

**pnpm workspace monorepo** (not Turborepo/Nx — the build graph is two apps + three
libraries; pnpm workspaces + npm-scripts keep it transparent with zero extra tooling).

```
apps/
  api/        Fastify 5 · Prisma 7 · PostgreSQL 18 · TypeScript 7
  web/        React 19 · Vite 8 · Tailwind 4 · TanStack Query · React Router 7
packages/
  types/      Shared Zod contracts + inferred TS types (single source of truth
              for request/response shapes across the API/web boundary)
  config/     Shared tsconfig bases
  ui/         Design-system primitives shared by web (and future surfaces)
```

Frontend and backend deploy independently: `web` is a static SPA bundle (Vercel),
`api` is a long-running Node process (Render/Railway/VPS). They share only
`packages/types`, which compiles to plain ESM with no runtime coupling.

## Phases

- [ ] **P1 — Foundation**: workspace, tsconfig, Prisma schema (full), migrations,
      RBAC permission model, auth (Argon2 + refresh-token rotation + email
      verification + reset), security middleware, error envelope, logging.
- [ ] **P2 — Public site**: design system, tokens, dark mode, home, services,
      consultants, articles, shop, contact, SEO, a11y.
- [ ] **P3 — Booking engine**: availability computation, slot generation,
      transactional conflict prevention, booking state machine, 10-step wizard.
- [ ] **P4 — Payments**: Paystack init/verify/webhook, deposits, balances,
      refunds, idempotency, invoices, finance dashboard.
- [ ] **P5 — Integrations**: calendar (Google/Microsoft OAuth), video provider
      abstraction (Zoom / Google Meet / Teams), connection status UI.
- [ ] **P6 — Portals**: client portal, consultant portal, sessions, private
      notes with server-side authorization split, reviews.
- [ ] **P7 — Commerce & CMS**: products, orders, digital asset delivery via
      signed URLs, articles, journal.
- [ ] **P8 — Admin**: dashboard, analytics, audit logs, notification centre,
      command menu, integrations settings, email logs.
- [ ] **P9 — Jobs & email**: background scheduler, reminders, review requests,
      balance reminders, expiry sweeps, transactional templates.
- [ ] **P10 — Hardening**: tests (RBAC, booking conflict, webhook replay, price
      tampering, note leakage), OpenAPI, performance, PWA, deployment docs.

## Non-negotiable rules encoded in the build

1. Server is the sole authority on price, availability, payment status and role.
2. Paystack webhook (signature-verified) is the only event that marks a booking paid.
3. Meeting links are created only after confirmed payment; failure records
   `MEETING_CREATION_FAILED` and alerts admins rather than faking success.
4. Private consultant notes are never selected into any client-facing query.
5. Missing integration credentials render "Not connected" — never fabricated data.
