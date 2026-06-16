#!/usr/bin/env bash
#
# Idempotent build + (re)start for the upCarrera droplet.
#
# Web = static Vite SPA (apps/web/dist) served by nginx; API = Nest under PM2.
# Prerequisites (one-time bootstrap — see DEPLOY.md): Node 20, pnpm via corepack,
# PM2, nginx, and apps/api/.env with a reachable DATABASE_URL + strong JWT_SECRET.
#
# Safe to re-run on every code update:  git pull && ./deploy/deploy.sh && sudo systemctl reload nginx
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
ROOT="$(pwd)"

# Public API origin baked into the web bundle at build time. A RELATIVE base keeps
# both admin.* and admissions.* same-origin (no CORS). Override with an absolute
# URL only if the API is served from a different origin.
export VITE_API_URL="${VITE_API_URL:-/api}"

echo "==> [1/5] Install dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> [2/5] Generate Prisma client"
pnpm --filter @upcarrera/api exec prisma generate

echo "==> [3/5] Build (api -> dist/main.js, web -> apps/web/dist) with VITE_API_URL=$VITE_API_URL"
pnpm build

echo "==> [4/5] Sanity: web bundle built, no localhost API URL leaked"
test -f "$ROOT/apps/web/dist/index.html" || {
  echo "ERROR: apps/web/dist/index.html missing — web build failed." >&2
  exit 1
}
if grep -rqs "localhost:3000" "$ROOT/apps/web/dist"; then
  echo "WARNING: 'localhost:3000' found in the web bundle — VITE_API_URL may not have applied." >&2
fi

echo "==> [5/5] (Re)start the API under PM2 (web is static — nginx serves apps/web/dist)"
if pm2 describe upcarrera-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save

echo "==> Build + API restart complete."
echo "    Reload nginx to serve the fresh web bundle:  sudo systemctl reload nginx"
echo "    Verify API:  curl -fsS http://127.0.0.1:3000/api/health"
