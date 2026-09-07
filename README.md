# Meridian Advisory

Consultation booking, client portal and management platform for a professional
advisory firm. A booking engine with real availability computation, Paystack
payments with deposit support, video-meeting and calendar integration, three
role-scoped portals, a commerce catalogue, a CMS, and an operational dashboard.

```
Public site  →  Booking engine  →  Paystack  →  Webhook  →  Meeting + calendar + email
                                                    ↓
                            Client portal · Consultant workspace · Admin
```

---

## Contents

- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Running the platform](#running-the-platform)
- [Integrations](#integrations)
- [Testing](#testing)
- [API documentation](#api-documentation)
- [Deployment](#deployment)
- [Design decisions](#design-decisions)

---

## Architecture

A **pnpm workspace monorepo**. Two applications that deploy independently, and
three libraries they share.

```
apps/
  api/          Fastify 5 · Prisma 7 · PostgreSQL · TypeScript 7
    prisma/     Schema, migrations, seed
    src/
      config/     Environment parsing and validation
      lib/        Prisma client, logger, crypto, errors, time
      plugins/    Auth, RBAC, error handling
      modules/    HTTP routes, grouped by domain
      services/   Business logic — the layer routes delegate to
  web/          React 19 · Vite 8 · Tailwind 4 · TanStack Query · React Router 7
    src/
      components/ Design system, layouts, booking widgets
      routes/     Public, auth, portal, consultant, admin
      providers/  Auth, theme, toast, cart
      lib/        API client, query hooks, formatting
packages/
  types/        Zod contracts and inferred types shared across the wire
  config/       Shared TypeScript configuration
  ui/           Reserved for design-system extraction
```

**Why a monorepo, and why this shape.** The API and the web client share one
thing that genuinely matters: the shape of every request and response. Putting
those contracts in `packages/types` means a change to a booking payload is a
compile error on both sides rather than a runtime surprise. Nothing else is
shared — `apps/web` builds to a static bundle, `apps/api` to a Node process,
and neither imports the other.

**Layering inside the API.** Routes parse input, check authorization and
serialise output. Everything else lives in `services/`. That boundary is what
lets the booking-conflict and payment tests exercise real logic without HTTP,
and it keeps authorization decisions in one reviewable place.

---

## Getting started

**Requirements:** Node 20.11+, pnpm 9+, PostgreSQL 14+.

```bash
git clone <repository-url> meridian
cd meridian
pnpm install
```

Create the database and a role for the application:

```bash
psql -U postgres -c "CREATE ROLE meridian WITH LOGIN PASSWORD 'change-me' CREATEDB;"
```

```bash
psql -U postgres -c "CREATE DATABASE meridian OWNER meridian ENCODING 'UTF8';"
```

Copy the environment template and fill in the secrets:

```bash
cp .env.example apps/api/.env
```

Generate the three secrets the API refuses to start without:

```bash
node -e "const c=require('crypto');console.log('JWT_SECRET='+c.randomBytes(48).toString('base64url'));console.log('JWT_REFRESH_SECRET='+c.randomBytes(48).toString('base64url'));console.log('ENCRYPTION_KEY='+c.randomBytes(32).toString('base64'))"
```

Set up the schema and seed a full demo dataset:

```bash
pnpm db:migrate && pnpm db:seed
```

Start both applications:

```bash
pnpm dev
```

- Web — <http://localhost:5173>
- API — <http://localhost:4000>
- API docs — <http://localhost:4000/docs>

### Seeded accounts

Every seeded account shares the password `Meridian2026!Demo`.

| Role | Email |
| --- | --- |
| Super administrator | `admin@meridianadvisory.co.ke` |
| Finance manager | `finance@meridianadvisory.co.ke` |
| Content manager | `editor@meridianadvisory.co.ke` |
| Consultant | `a.mwangi@meridianadvisory.co.ke` |
| Client | `grace.njeri@savannaagro.co.ke` |

The seed creates 5 consultants, 8 services, 15 clients, 30 bookings with
matching payments and invoices, 20 sessions with notes, 12 reviews, 12 articles
including 2 peer-reviewed papers, and 10 products.

---

## Environment variables

The full annotated list is in [`.env.example`](.env.example). The API parses
it through a Zod schema at boot and **exits with a readable report** rather
than starting in a broken state.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | ≥32 chars; signs access tokens |
| `JWT_REFRESH_SECRET` | yes | ≥32 chars |
| `ENCRYPTION_KEY` | yes | Exactly 32 bytes, base64. AES-256-GCM key for OAuth tokens at rest |
| `APP_URL` / `API_URL` | yes | Used for CORS, email links and OAuth redirect URIs |
| `PAYSTACK_SECRET_KEY` | for payments | **Server only.** Never sent to a browser |
| `PAYSTACK_PUBLIC_KEY` | for payments | The only key exposed to the client |
| `GOOGLE_CLIENT_ID` / `_SECRET` | for Google | Calendar and Meet |
| `MICROSOFT_CLIENT_ID` / `_SECRET` | for Microsoft | Outlook Calendar and Teams |
| `ZOOM_CLIENT_ID` / `_SECRET` / `_ACCOUNT_ID` | for Zoom | Server-to-Server OAuth app |
| `EMAIL_PROVIDER` | yes | `smtp`, `resend` or `console` |
| `STORAGE_DRIVER` | yes | `s3` or `local` |

### Development mocks

`MOCK_PAYMENTS`, `MOCK_VIDEO`, `MOCK_EMAIL` and `MOCK_CALENDAR` substitute
recording adapters for automated tests.

**The API refuses to boot if any of them is true while `NODE_ENV=production`.**
This is enforced in `src/config/env.ts`, and the video mock throws a second time
if it is constructed in production. A mock adapter that reached live users would
fabricate a payment or a meeting link; two independent guards is the correct
number for that failure mode.

---

## Database

38 models. Conventions that hold throughout:

- **Money is `Int` in minor units.** Cents, kobo, pesewas. No floating-point
  money is stored or transmitted, and Paystack expects minor units too, so no
  conversion happens at the payment boundary either.
- **Instants are `Timestamptz(3)`, always UTC.** Display timezone is a
  per-user preference resolved at render time.
- **Working hours are wall-clock strings** in the consultant's own timezone, so
  09:00 stays 09:00 across a daylight-saving change.

```bash
pnpm db:migrate      # create and apply a migration in development
pnpm db:deploy       # apply pending migrations (production)
pnpm db:seed         # idempotent — re-running updates rather than duplicates
pnpm db:studio       # browse the data
pnpm db:reset        # drop, re-migrate, re-seed (development only)
```

Indexes exist on every column the application filters or joins on:
`Booking(startAt)`, `Booking(consultantId, startAt)`, `Booking(clientId)`,
`Payment(reference)`, `Payment(status)`, `User(email)`, `Article(slug)`,
`Product(slug)`, and roughly 150 more.

### Prisma 7 note

Prisma 7 moved the datasource URL out of `schema.prisma`. It now lives in
`apps/api/prisma.config.ts` for the CLI, and reaches the runtime through the
`@prisma/adapter-pg` driver adapter in `src/lib/prisma.ts`.

---

## Running the platform

```bash
pnpm dev              # both apps
pnpm dev:api          # API only
pnpm dev:web          # web only
pnpm build            # build everything
pnpm typecheck        # TypeScript across the workspace
pnpm lint             # ESLint across the workspace
pnpm lint:fix         # ...and apply what can be fixed automatically
pnpm test             # API test suite
```

`pnpm lint` runs one pass over every package plus the root config files.
`pnpm --filter @meridian/web lint` narrows it to a single package when that is
faster. Both are clean at zero warnings; `--max-warnings 0` is deliberate, since
a lint command that always reports something is a lint command nobody reads.

Background jobs run inside the API process by default. To scale them
separately, set `RUN_JOBS_IN_PROCESS=false` and run:

```bash
pnpm --filter @meridian/api jobs
```

The worker handles 24-hour and 1-hour session reminders, review requests,
balance reminders, expiring unpaid holds, sweeping abandoned payments,
publishing scheduled articles, refreshing calendar busy periods, and alerting
on bookings stuck without a meeting link. Every handler is idempotent and every
enqueue is deduplicated, because at-least-once is the only delivery guarantee a
database-backed queue can honestly make.

Roles and their permissions are defined in code (`packages/types/src/permissions.ts`)
and stored in the database. When a permission is added or moved between roles,
bring an existing environment back in line without reseeding:

```bash
pnpm --filter @meridian/api permissions:sync
```

It rewrites the permission catalogue and each role's grants — including
revoking anything a role no longer holds — and touches nothing else. Signed-in
users keep their old set until their access token expires.

---

## Integrations

Every integration follows the same rule: **when credentials are absent, the
platform reports "Not connected" and refuses the operation.** It never
fabricates a meeting URL, a payment confirmation or a calendar sync. Admin →
Integrations shows real state derived from whether the credentials work.

### Paystack

1. Create an account and take your keys from **Settings → API Keys & Webhooks**.
2. Set `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY`.
3. Register the webhook URL: `{API_URL}/api/webhooks/paystack`.

Test cards are in Paystack's documentation. Use ngrok or a similar tunnel to
receive webhooks locally.

The payment flow, and why it is shaped this way:

```
Client → API creates booking (server computes the amount)
       → API initialises the Paystack transaction
       → Browser completes Paystack checkout
       → Paystack POSTs the webhook
       → API verifies the HMAC-SHA512 signature over the raw body
       → API re-checks the amount against what it computed
       → Booking marked paid → meeting created → calendar → emails
```

The browser reaching the callback URL is **not** treated as proof of payment.
The signature-verified webhook is authoritative; the confirmation page
additionally asks the server to verify with Paystack directly, which is
idempotent and safe to repeat.

### Zoom

A **Server-to-Server OAuth** app in the Zoom Marketplace. The firm's own Zoom
account hosts every consultation, so there is no per-user authorisation step.
Scopes: `meeting:write:admin`, `meeting:read:admin`. Set `ZOOM_CLIENT_ID`,
`ZOOM_CLIENT_SECRET`, `ZOOM_ACCOUNT_ID`.

### Google Calendar and Google Meet

A Google Cloud project with the Calendar API and Meet API enabled. Redirect
URI: `{API_URL}/api/integrations/google/callback`. Scopes:
`calendar.events`, `calendar.readonly`, `meetings.space.created`.

Meet spaces store the space **`name`** (`spaces/<id>`) as their identifier, not
the `meetingCode`. Google documents that a meeting code can become dissociated
from its space and be reused, and expires about 365 days after last use — it is
not a durable identifier.

### Microsoft Teams and Outlook Calendar

An Entra ID app registration. Redirect URI:
`{API_URL}/api/integrations/microsoft/callback`. Permission:
`Calendars.ReadWrite`.

Teams meetings are created as **calendar events with
`isOnlineMeeting: true` and `onlineMeetingProvider: "teamsForBusiness"`**,
not through the standalone `/onlineMeetings` endpoint. The standalone endpoint
returns a join URL but the consultation never appears in the consultant's
Outlook calendar — invisible to the person hosting it, and not blocking their
availability. One Graph call gives us both.

### Email and storage

`EMAIL_PROVIDER` selects SMTP, Resend, or the console provider (which logs a
line and states plainly that nothing was sent). Every send writes an
`EmailLog` row, before and after the attempt, so a failure is visible in
Admin → Emails rather than lost in a log file.

`STORAGE_DRIVER=s3` for any S3-compatible service. Private files — purchased
books, consultation attachments — are served only through short-lived signed
URLs, never a public bucket path.

---

## Testing

```bash
pnpm test                                  # everything
pnpm --filter @meridian/api test:watch     # watch mode
```

Tests run against a separate `meridian_test` database. `tests/setup.ts`
**refuses to run** if `DATABASE_URL` does not point at a `*_test` database, so
a stray shell variable cannot truncate development data.

```bash
psql -U postgres -c "CREATE DATABASE meridian_test OWNER meridian;"
```

```bash
cd apps/api && cp .env .env.test   # then set NODE_ENV=test and the _test database
```

The suite covers the properties that would be most damaging to get wrong:

| Property | Test |
| --- | --- |
| Two clients cannot book the same slot | `booking-conflict.test.ts` — including a 10-way concurrent race |
| Service buffers are honoured in conflict detection | `booking-conflict.test.ts` |
| A cancelled booking releases its slot | `booking-conflict.test.ts` |
| A replayed webhook cannot double-credit | `payment-security.test.ts` |
| A forged webhook signature is rejected | `payment-security.test.ts` |
| Paystack reporting a different amount does not settle | `payment-security.test.ts` |
| A client cannot change the price sent to Paystack | `payment-security.test.ts` |
| An unpaid booking exposes no meeting link | `payment-security.test.ts` |
| A client cannot read another client's booking | `authorization.test.ts` |
| A client never receives private consultant notes | `authorization.test.ts` |
| A consultant cannot edit another consultant's notes | `authorization.test.ts` |
| Permission checks are on capability, not role | `authorization.test.ts` |
| A consultant cannot reach the practice-wide admin lists | `authorization.test.ts` |
| A consultant's clients and calendar contain only their own | `authorization.test.ts` |
| An unknown client is a 404, not an existence-revealing 403 | `authorization.test.ts` |
| A consultant cannot publish or re-slug their own profile | `authorization.test.ts` |
| A client cannot enter the consultant workspace | `authorization.test.ts` |
| A discount is worth what the rule says, not what the request says | `discount.test.ts` |
| A percentage is capped, and never exceeds the basket | `discount.test.ts` |
| An expired, withdrawn or unknown code is refused alike | `discount.test.ts` |
| A per-client limit holds across bookings | `discount.test.ts` |
| Two bookings racing for the last redemption — only one wins | `discount.test.ts` |

Two of these tests found real bugs during development: concurrent settlement
double-crediting a booking (fixed with an atomic compare-and-set claim), and
`sessions.notes` granting any consultant access to any session (fixed by
separating the *capability* to read notes from the *scope* of sessions
reachable).

Building the admin screens surfaced four more, none of which the suite would
have caught because no screen exercised those paths until then:

- `.partial()` on a Zod schema carrying refinements throws at runtime, so the
  service and product update endpoints returned a 500 for every request. Fixed
  by splitting each schema into a plain field set plus separate create and
  update rules.
- A `DELETE` carrying `Content-Type: application/json` with no body was
  rejected as malformed. The JSON parser now treats an empty body as absent.
- Cancelling an order did not return its stock, so every abandoned checkout
  permanently reduced inventory.
- `z.coerce.boolean()` made `?isJournal=false` mean `true`, so the public
  Insights page and the admin article list both showed journal papers.

Building the consultant and client portal screens surfaced one more, and it was
the most serious of the set:

- **A consultant could read the whole practice.** `CONSULTANT` held the broad
  `clients.read`, `invoices.read` and `analytics.read`. Those are exactly the
  permissions the admin routes are gated on, so any consultant's token could
  fetch `/api/admin/clients` (every client on the platform, with contact details
  and staff-only `internalNotes`), `/api/admin/invoices` and
  `/api/admin/analytics` — firm-wide revenue included. No screen linked there,
  which is why it went unnoticed; the API did not care. Fixed by adding
  `clients.read.own`, narrowing the consultant role to it, and serving the
  workspace from `/api/consultant/*` routes that scope on the session's own
  `consultantProfileId`. Six tests now hold the line.

  Existing databases need `pnpm --filter @meridian/api permissions:sync` to pick
  up the revised grants; it rewrites the permission catalogue and role grants
  without touching any other data.

Wiring up ESLint — which had a `lint` script in every package but had never had
the dependency installed, so it had never once run — surfaced these:

- **`/portal` was a white screen for anyone without a client profile.** The
  dashboard endpoint's empty branch omitted `upcoming` and `outstandingBookings`
  while the DTO declared both as required arrays, and the browser read `.length`
  of `undefined`. A consultant or administrator opening the portal got a blank
  page. The API now returns the complete shape, and the call sites that were
  written as `data?.field.length` — which guards `data` and not the field — were
  made genuinely safe. Found by clicking through, not by the linter.
- **Two admin route modules re-exported `cn` and a pair of lucide icons.** Dead
  code: nothing imported them, and they were imported into those files purely to
  be re-exported.
- **The rich text editor asked for link URLs with `window.prompt`** and rejected
  bad ones with `window.alert`. Now an accessible dialog with an inline error,
  which also means the selection survives — the old flow relied on the browser
  restoring it.
- **Eighteen `setState` calls inside effects**, each rendering once with the
  wrong state before correcting it: the theme resolved after paint, the reveal
  animations flashed hidden content at reduced-motion users, the admin editors
  showed an empty form for a frame before filling it, and the mobile drawer
  painted at the new route before closing. All now derived or adjusted during
  render.

---

## API documentation

Interactive documentation is served at `/docs` and generated from the live
route definitions, so it cannot drift from what the server serves.

```bash
pnpm --filter @meridian/api openapi:export ../../openapi.json
```

107 paths across 19 tags. Every response uses one envelope:

```json
{ "success": true, "data": { } }
```

```json
{ "success": false, "error": { "code": "BOOKING_CONFLICT", "message": "The selected time is no longer available." } }
```

Clients switch on `code`; `message` is safe to show a user and never carries a
stack trace or internal detail.

---

## Deployment

Designed so the two applications deploy and scale independently.

| Component | Target |
| --- | --- |
| Web | Vercel, Netlify, Cloudflare Pages — any static host |
| API | Render, Railway, Fly.io, or a VPS |
| Worker | The same image as the API, running `pnpm --filter @meridian/api jobs` |
| Database | Managed PostgreSQL — Supabase, Neon, RDS |
| Storage | Any S3-compatible service |

### Web

`vercel.json` at the repository root already carries the install command, build
command, output directory, SPA rewrite and cache headers, so a Vercel project
pointed at the repo root needs only:

```
Environment:        VITE_API_URL=https://api.your-domain.com
```

For any other host, the equivalent is:

```
Install:            pnpm install --frozen-lockfile --filter @meridian/web...
Build:              pnpm --filter @meridian/types build && pnpm --filter @meridian/web build
Output directory:   apps/web/dist
```

The `--filter @meridian/web...` matters. Without it the whole workspace is
installed, which drags `argon2`, `prisma` and `@prisma/engines` — all API-only,
all needing a native compile or a binary download — into a build that only
produces static files. The filtered install skips them entirely and is roughly
twice as fast.

A single SPA rewrite to `/index.html` would also swallow `sw.js`,
`manifest.webmanifest` and `offline.html`, breaking the service worker, so the
rewrite in `vercel.json` excludes `/assets/*` and any path with a file
extension.

> **If a deploy fails with `ERR_PNPM_IGNORED_BUILDS`,** the `allowBuilds` block
> in `pnpm-workspace.yaml` is the thing to check. pnpm 11 reads that key, and
> every entry must be `true` — pnpm scaffolds the block with the placeholder
> text `set this to true or false`, which approves nothing. A warm
> `node_modules` hides the problem, because the approval is also recorded in
> `node_modules/.modules.yaml`; only a clean install shows it. `pnpm
> approve-builds --all` fills the block in correctly.

### API

```
Build command:      pnpm install && pnpm --filter @meridian/types build && pnpm --filter @meridian/api build
Start command:      pnpm --filter @meridian/api db:deploy && pnpm --filter @meridian/api start
Health check:       /health
```

`/health` returns 503 when the database is unreachable, so a rolling deploy
will not route traffic to an instance that cannot serve it.

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] `COOKIE_SECURE=true` (the API refuses to boot otherwise)
- [ ] All four `MOCK_*` flags false (the API refuses to boot otherwise)
- [ ] `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` freshly generated,
      never reused from another environment
- [ ] `APP_URL` and `API_URL` set to real origins — CORS is built from `APP_URL`
- [ ] Paystack webhook registered at `{API_URL}/api/webhooks/paystack`
- [ ] `EMAIL_PROVIDER` is not `console`
- [ ] Private storage bucket has public access blocked
- [ ] Database backups configured

---

## Design decisions

A short record of the choices a reviewer is most likely to question.

**Serializable transactions for booking creation.** Checking availability and
then inserting is a race: two requests can both see a free slot. The check and
the insert run inside one `Serializable` transaction, and serialization
failures are retried with jitter before being reported as a conflict. The
10-way concurrent test exists to prove this holds.

**Buffers participate in conflict detection.** Bookings store `blockStartAt`
and `blockEndAt` — the session padded by the service's turnaround buffers — and
conflicts are detected on those columns. Otherwise back-to-back bookings would
be legal and consultants would have no gap.

**Payment settlement is an atomic claim.** `settlePayment` marks a payment paid
with a conditional `updateMany` that only matches a not-yet-settled row. Under
READ COMMITTED the second transaction blocks on the row lock, re-evaluates its
`WHERE`, and matches nothing — so exactly one caller ever runs the side effects.

**Private notes are protected twice.** The route picks a serialiser based on
the caller's relationship to the session, *and* the client-facing serialiser
has no code path to the private field. Either alone would be sufficient on a
good day; together, a mistake in one is caught by the other.

**Permissions are capabilities, not scopes.** `sessions.notes` says what you may
do with notes you can already reach; `sessions.read` (broad) versus
`sessions.read.own` says which sessions you reach. Conflating the two is what
caused the authorization bug the test suite caught.

**Meeting links are created only after confirmed payment.** If creation fails,
the booking is *not* presented as complete: the `VideoMeeting` row records
`FAILED` with the reason, administrators are emailed and notified, the client's
confirmation carries no join link, and the admin dashboard offers an idempotent
retry.

**The service worker caches no API response.** Bookings, session notes and
invoices are personal and often confidential. Storing them in the Cache API
would leave them readable on a shared device after sign-out, which no
invalidation scheme reliably prevents. The portal is installable; it is not
offline-capable for private data, and the offline page says so.

**The admin catalogue lives behind its own routes.** Public list endpoints
filter on `status: PUBLISHED`; an editor needs drafts. Rather than adding a
"show me drafts too" flag to a public endpoint — where one forgotten permission
check leaks unpublished work — `/api/admin/services`, `/api/admin/products` and
`/api/admin/articles/:id` are separate routes behind their own permissions.

**Editors address records by id, not slug.** A draft's slug changes while it is
being written, and the record under edit must not change with it.

**Boolean query parameters use `queryBooleanSchema`, never `z.coerce.boolean()`.**
Zod's coercion applies `Boolean(value)`, and every non-empty string is truthy —
so `?isJournal=false` silently means `true`. That bug shipped into three
endpoints before the admin screens surfaced it.

**The consultant workspace scopes on the session, not on a permission.** Every
route under `/api/consultant/*` derives its filter from `user.consultantProfileId`
— the id attached to the verified session — and never from a query parameter.
A permission answers *may you read clients*; it cannot answer *which clients*,
and treating it as though it could is what produced the leak described above.
`clients.read.own` exists so the two questions have separate answers.

**A consultant may edit their profile but not publish it.** `PATCH
/api/consultant/profile` accepts the biography, specialties, qualifications,
languages and links. `slug`, `isPublished`, `sortOrder` and the linked services
stay admin-only, because those decide whether and where a consultant appears in
the catalogue — a profile that can publish itself makes the review step
decorative.

**Requesting payment queues the scheduler's own job.** The consultant's
"Request payment" action does not send an email directly; it enqueues the same
`BALANCE_REMINDER` job the scheduler uses, whose handler re-reads the booking
and declines if the balance was settled in the meantime. The dedupe key is per
booking per day, so a double-click is a no-op and a client cannot be chased
repeatedly. The endpoint never touches payment status.

**"Send a message" opens a mail client.** There is no message model in this
schema, and inventing an in-app inbox that silently drops messages would be
worse than honest. The action is a `mailto:` with the reference pre-filled.

**One reschedule screen serves both portals.** The API already decides who may
move a booking, and grants a consultant the right to move one inside the window
a client would be refused. Only the breadcrumbs and the return path differ, so
the screen takes those as a parameter rather than existing twice.

**A discount code is the only price input a client has.** The browser sends a
code; it never sends an amount. `quoteDiscount` reads the rule and the
catalogue price, and `createBooking` runs the same calculation again at checkout
— the preview endpoint exists for the summary line and reserves nothing. The
redemption caps are races rather than validations, so `maxRedemptions` is claimed
with a conditional `updateMany` guarded on the count (the same shape as payment
settlement) and the per-client limit is counted inside the booking transaction.
A test races two bookings for a single remaining use and asserts that exactly one
gets it.

**Withdrawing a used code deactivates it; an unused one is deleted.** Its
redemptions are part of the financial record, and deleting the rule would leave
rows pointing at nothing.

**Branding assets have a fixed public URL, not a signed one.** A favicon cannot
be a link that expires, and neither can a logo sitting in a cached page or an
email. `GET /api/branding/:asset` resolves the current storage key per request,
so replacing a logo changes what the same URL serves. Cache-busting is the
asset's own updated-at stamp, which changes on upload and never otherwise.
Uploads are served with `nosniff` and a `sandbox` CSP, because an SVG is a
document that can carry script and a logo should not be able to.

**Deleting is refused where archiving is the honest answer.** A service with
bookings, a product on an order, a published article — each keeps a record that
something else depends on, so the endpoints check for those references and
refuse with a message naming what is in the way. The UI only offers permanent
deletion once a record is archived, so a live URL is retired in two deliberate
steps.

**Renaming the platform is `branding.manage`, not `settings.manage`.** An
administrator deliberately does not hold `settings.manage`, which gates payment
and booking configuration. Changing the name and logo is a day-to-day editorial
job and should not require the same key as changing how money is taken.

**ESLint parses TypeScript with Babel, not typescript-eslint.** This is forced,
not preferred. TypeScript 7's npm package wraps the native Go compiler, and its
main export is `{ version, versionMajorMinor }` — `ts.createSourceFile`,
`ts.createProgram` and `ts.SyntaxKind` no longer exist. Every typescript-eslint
parser is built on those, so none of them can read this codebase; the
`typescript <6.1.0` peer range is a symptom rather than the cause. Babel has
always parsed TypeScript with its own grammar and never touches the compiler.

The consequence is worth stating plainly: **no type-aware lint rules.**
`no-floating-promises` and friends need a type checker and are unavailable.
`pnpm typecheck` runs the real compiler over every package and covers that
ground, so the two commands are complementary — `tsc` is the correctness gate,
ESLint the consistency gate. Revisit when typescript-eslint adopts TypeScript
7's `unstable/ast` API.

**The Babel presets live in a file, not inline in the ESLint config.** ESLint
deep-merges `parserOptions` when it flattens the config, and the merge does not
preserve arrays: a nested `presets: [[a], [b]]` reaches Babel as
`{ "0": ..., "1": ... }`, which it ignores. Every TypeScript file then fails to
parse with a misleading "Unexpected token, expected ," on its first type
annotation. Passing a path sends one string through the merger instead. The file
is named `babel.eslint.config.json` rather than `babel.config.json` because
Babel auto-discovers the latter and `@vitejs/plugin-react` runs Babel during the
web build — a discoverable config there would quietly change what ships.

**Tailwind 4 configured in CSS.** Every colour is a token, so light and dark
are two definitions of one vocabulary rather than two sets of components. Dark
mode is designed rather than inverted: a desaturated navy ground, cards
*lighter* than the page, borders raised in luminance, and a lightened accent
that keeps its contrast.

---

## Licence

Proprietary. © Meridian Advisory Limited.
