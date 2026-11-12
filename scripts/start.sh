#!/bin/sh
# Startup script for production container.
# Runs migrations, superadmin seed, then starts Next.js.
# "set -e" means any command that exits non-zero aborts the whole script,
# so the container fails fast and Dokploy won't serve broken traffic.
set -e

echo "[start] ── Applying database migrations ──────────────────────────────"
npx prisma migrate deploy
echo "[start] migrate deploy: OK"

# ── Schema drift check ──────────────────────────────────────────────────────
# Fails the container if schema.prisma has models/fields that no migration
# covers. Without this, P2021 errors only surface at request time.
echo "[start] ── Checking for unapplied schema changes ─────────────────────"
if npx prisma migrate diff \
     --from-local-db \
     --to-schema-datamodel prisma/schema.prisma \
     --exit-code 2>/dev/null; then
  echo "[start] schema drift check: OK (no diff)"
else
  echo "[start] ERROR: schema.prisma has changes not covered by a migration."
  echo "[start]   Run 'prisma migrate dev' locally, commit the new migration,"
  echo "[start]   and redeploy."
  exit 1
fi

# ── Failsafe: add new columns with IF NOT EXISTS ────────────────────────────
# Runs after migrate deploy. Safe to execute on every startup:
# PostgreSQL silently skips the ALTER if the column already exists.
# This guards against the case where _prisma_migrations recorded the migration
# as applied but the SQL was never executed (network interruption, etc.).
echo "[start] ── Ensuring schema columns exist (failsafe) ─────────────────"
npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
ALTER TABLE "businesses"  ADD COLUMN IF NOT EXISTS "latitude"     DOUBLE PRECISION;
ALTER TABLE "businesses"  ADD COLUMN IF NOT EXISTS "longitude"    DOUBLE PRECISION;
ALTER TABLE "businesses"  ADD COLUMN IF NOT EXISTS "locationName" TEXT;
ALTER TABLE "customers"   ADD COLUMN IF NOT EXISTS "birthDate"    TIMESTAMP(3);
SQL
echo "[start] failsafe columns: OK"

echo "[start] ── Running superadmin setup ─────────────────────────────────"
npx ts-node --project tsconfig.seed.json scripts/create-superadmin.ts
echo "[start] superadmin: OK"

echo "[start] ── Starting Next.js ──────────────────────────────────────────"
exec npx next start
