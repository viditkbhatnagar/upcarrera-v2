# upcarrera-v2

[![CI](https://github.com/viditkbhatnagar/upcarrera-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/viditkbhatnagar/upcarrera-v2/actions/workflows/ci.yml)

TypeScript rewrite of the upcarrera LMS/CRM — a port of the original PHP/CodeIgniter 4 app
([upcarrera_migration](https://github.com/viditkbhatnagar/upcarrera_migration)) to a modern,
scalable stack. Built domain-by-domain, each phase verified end-to-end against the real database.

## Stack

| Layer | Tech |
|---|---|
| **Monorepo** | pnpm workspaces + Turborepo |
| **API** (`apps/api`) | **NestJS** + **Prisma** over the existing **MySQL** — 15 modules, 121 endpoints |
| **Web** (`apps/web`) | **Next.js 14** (App Router) + React + Tailwind — 35 pages, full CRUD |
| **Auth** | JWT (Bearer / cookie). Existing PHP `$2y$` bcrypt hashes verify unchanged. |
| **Tests** | Jest + Supertest e2e — runs in CI on every push |

## Features

- **Auth + RBAC** — JWT, a `PermissionsGuard` (allow-list, super-admin bypass), the legacy
  `{status, message, data}` response envelope preserved for mobile clients.
- **All domains** — leads/CRM, students & applications, academics, teachers, finance, sessions,
  platform — full CRUD + list/pagination, soft-delete.
- **Business logic** — transactional lead/application → student conversion, payment → invoice
  settlement, salary computation, secure file upload/download.
- **Integrations** (env-gated) — Zoom (S2S + Meeting SDK), Brevo email, 2factor SMS/OTP, Razorpay.
- **More** — bulk Excel import (`exceljs`), reports + CSV export, invoice/receipt PDF (`pdfkit`),
  notifications, and a `/api/student/*` surface for the mobile app.

## Quick start

Requires Node ≥ 20, pnpm, and a MySQL with the upcarrera schema.

```bash
pnpm install

# 1. API
cp apps/api/.env.example apps/api/.env     # fill DATABASE_URL + JWT_SECRET (+ optional integration keys)
pnpm --filter @upcarrera/api exec prisma generate
pnpm --filter @upcarrera/api build
node --env-file=apps/api/.env apps/api/dist/main.js   # API on http://localhost:3000/api

# 2. Web
cp apps/web/.env.example apps/web/.env.local           # NEXT_PUBLIC_API_URL=http://localhost:3000/api
pnpm --filter @upcarrera/web build
pnpm --filter @upcarrera/web exec next start -p 3001   # Web on http://localhost:3001
```

Fresh database? Build the schema and seed it with Prisma (no SQL dump needed):

```bash
cd apps/api
pnpm exec prisma db push                                          # schema from prisma/schema.prisma
pnpm exec prisma db execute --file ../../database/ci-seed.sql --schema prisma/schema.prisma
```

## Tests

```bash
cd apps/api && pnpm exec jest --config ./test/jest-e2e.json --runInBand
```

The e2e suite boots the real `AppModule` against MySQL and exercises auth, CRUD, RBAC, the
conversion sagas, payments, and reports. CI runs it on every push against a fresh seeded MySQL.

## Layout

```
apps/api/   NestJS API (modules: auth, leads, students, academics, teachers, finance,
            sessions, platform, files, integrations, reports, notifications, student)
apps/web/   Next.js staff app (app/(staff)/<domain> list + new/[id]/[id]/edit)
database/   ci-seed.sql (CI seed loaded by the e2e workflow)
scripts/    normalize-zero-dates.sql (run against production at cutover)
deploy/     nginx config + deploy/db-cutover runbook scripts (see DEPLOY.md)
.github/    CI workflow
```

## Notes for production

For the full terminal-driven DigitalOcean deploy + verification runbook, see [DEPLOY.md](DEPLOY.md).

- Set the integration API keys in `apps/api/.env` (Zoom, Brevo, 2factor, Razorpay) — all are
  env-gated and the app runs without them.
- Run `scripts/normalize-zero-dates.sql` against production once, before cutover (Prisma rejects
  MySQL `0000-00-00` dates).
