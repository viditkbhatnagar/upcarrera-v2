#!/usr/bin/env bash
#
# One-time production DB cutover into DigitalOcean Managed MySQL 8.
#   1. Load the real mysqldump (carries the DDL + foreign keys the Prisma schema
#      does not declare — this is why we load a dump, never `prisma db push`).
#   2. NULL all 0000-00-00 zero-dates (Prisma rejects them at read time).
#   3. `prisma db pull --print` to confirm the live schema matches expectations.
#
# Required env (connection over mandatory TLS):
#   DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD   DO Managed MySQL credentials
#   DB_CA_CERT   path to the DigitalOcean CA certificate
#   DUMP_FILE    path to the production mysqldump (.sql) — delivered out-of-band
#
# apps/api/.env must already contain the matching DATABASE_URL (with SSL params)
# so the drift check in step 3 can introspect the same database.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DB_HOST:?set DB_HOST}"
: "${DB_PORT:?set DB_PORT}"
: "${DB_NAME:?set DB_NAME}"
: "${DB_USER:?set DB_USER}"
: "${DB_PASSWORD:?set DB_PASSWORD}"
: "${DB_CA_CERT:?set DB_CA_CERT (path to the DO CA cert)}"
: "${DUMP_FILE:?set DUMP_FILE (path to the production mysqldump)}"

# Credentials go in a chmod-600 defaults file, NOT on the mysql command line
# (CLI flags are visible to any user via `ps`). printf keeps the literal value
# out of this script's source — it is read from the environment at runtime.
MYSQL_CNF="$(mktemp)"
chmod 600 "$MYSQL_CNF"
trap 'rm -f "$MYSQL_CNF"' EXIT
{
  printf '[client]\n'
  printf 'host=%s\n' "$DB_HOST"
  printf 'port=%s\n' "$DB_PORT"
  printf 'user=%s\n' "$DB_USER"
  printf 'password=%s\n' "$DB_PASSWORD"
  printf 'ssl-ca=%s\n' "$DB_CA_CERT"
  printf 'ssl-mode=%s\n' "REQUIRED"
} > "$MYSQL_CNF"

MYSQL=(mysql --defaults-extra-file="$MYSQL_CNF" "$DB_NAME")

echo "==> [1/3] Loading $DUMP_FILE into $DB_NAME@$DB_HOST over TLS"
"${MYSQL[@]}" < "$DUMP_FILE"

echo "==> [2/3] Normalizing 0000-00-00 zero-dates (scripts/normalize-zero-dates.sql)"
"${MYSQL[@]}" < scripts/normalize-zero-dates.sql

echo "==> [3/3] Confirming schema (prisma db pull --print, read-only)"
pnpm --filter @upcarrera/api exec prisma db pull --print > /tmp/uc_introspected.prisma
echo "    Wrote /tmp/uc_introspected.prisma — diff it against apps/api/prisma/schema.prisma."
echo "    Any delta means the dump's schema diverged from what the app expects."

echo "==> DB cutover complete. NEVER run 'prisma db push' against this data (it would drop the FKs)."
