# upcarrera-v2 — TypeScript rewrite

Port of the CodeIgniter 4 (PHP) upcarrera LMS/CRM to a scalable TypeScript stack.
See `../upcarrera/MIGRATION_BLUEPRINT.md` for the full plan.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **API (`apps/api`):** NestJS + Prisma over the existing MySQL (strangler-fig — same DB as the legacy app)
- **Web (`apps/web`):** Next.js + React — _coming next_
- **Auth:** JWT (Bearer), `{status, message, data}` envelope preserved for mobile compatibility. Existing bcrypt (`$2y$`) password hashes verify unchanged.

## Status

| Slice | State |
|---|---|
| Monorepo + tooling | ✅ done |
| Prisma schema (63 tables introspected from MySQL) | ✅ done (`apps/api/prisma/schema.prisma`) |
| **Auth + RBAC vertical slice** | ✅ working & tested against real data |
| Leads / CRM | ⬜ next |
| Everything else | ⬜ per the blueprint |

### What the Auth slice proves
- Prisma talks to the existing MySQL with zero schema changes.
- `bcryptjs` verifies the legacy PHP password hashes.
- The legacy `{status,message,data}` response envelope is reproduced (success + error).
- Global `JwtAuthGuard` (with `@Public()` opt-out) + `RolesGuard` move authz to the controller layer.
- The legacy `upcarrera@2024` backdoor is **not** ported; JWT TTL fixed to 7 days.

## Run it locally

Prereqs: Node ≥20, pnpm, and a MySQL with the upcarrera schema/data.

```bash
pnpm install

# point apps/api/.env at your MySQL, then:
cd apps/api
pnpm exec prisma db pull      # introspect (already committed)
pnpm exec prisma generate
pnpm run build
node --env-file=.env dist/main.js   # API on http://localhost:3000/api
```

### Smoke test

```bash
curl -s -H "Content-Type: application/json" \
  -d '{"username":"<user>","password":"<pass>"}' \
  http://localhost:3000/api/auth/login
```

## Layout

```
apps/api/src/
├── main.ts                     # bootstrap: /api prefix, global envelope + filter
├── app.module.ts               # global JwtAuthGuard + RolesGuard
├── prisma/                     # PrismaService (connects to MySQL)
├── auth/                       # AuthController/Service, JwtStrategy, guards, DTOs
└── common/                     # response interceptor, exception filter, decorators
```
