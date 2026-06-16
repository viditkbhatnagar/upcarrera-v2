#!/usr/bin/env bash
#
# Idempotent app build + (re)start for the upCarrera droplet.
#
# Prerequisites (one-time server bootstrap — see DEPLOY.md): Node 20, pnpm via
# corepack, PM2, nginx, and apps/api/.env already in place with a reachable
# DATABASE_URL + a strong JWT_SECRET.
#
# Safe to re-run on every code update:  git pull && ./deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
ROOT="$(pwd)"

# Public API origin baked into the web bundle at build time. A RELATIVE base keeps
# both admin.* and admissions.* same-origin (no CORS). Override by exporting an
# absolute URL before running, e.g. NEXT_PUBLIC_API_URL=https://admin.upcarrera.com/api
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}"

echo "==> [1/5] Installing dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> [2/5] Generating Prisma client"
pnpm --filter @upcarrera/api exec prisma generate

echo "==> [3/5] Building (api -> dist, web -> .next) with NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"
pnpm build

echo "==> [4/5] Sanity check: no localhost API URL leaked into the web bundle"
if grep -rqs "localhost:3000" "$ROOT/apps/web/.next"; then
  echo "WARNING: 'localhost:3000' found in the built web bundle — NEXT_PUBLIC_API_URL may not have applied." >&2
fi

echo "==> [5/5] (Re)starting PM2 processes"
if pm2 describe upcarrera-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save

echo "==> Deploy complete."
echo "    Verify API:  curl -fsS http://127.0.0.1:3000/api/health"
echo "    Verify web:  curl -fsS -I http://127.0.0.1:3001/"
