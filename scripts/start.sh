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
# Compares migrations (not live DB) against schema.prisma via a shadow DB.
# Set SHADOW_DATABASE_URL in Dokploy to a separate PostgreSQL database.
# Skipped gracefully when SHADOW_DATABASE_URL is absent.
echo "[start] ── Checking for unapplied schema changes ─────────────────────"
if [ -z "${SHADOW_DATABASE_URL:-}" ]; then
  echo "[start] schema drift check: skipped (SHADOW_DATABASE_URL not set)"
else
  DIFF_EXIT=0
  npx prisma migrate diff \
       --from-migrations prisma/migrations \
       --to-schema-datamodel prisma/schema.prisma \
       --shadow-database-url "$SHADOW_DATABASE_URL" \
       --exit-code 2>&1 || DIFF_EXIT=$?
  if [ "$DIFF_EXIT" = "0" ]; then
    echo "[start] schema drift check: OK (no diff)"
  elif [ "$DIFF_EXIT" = "1" ]; then
    echo "[start] ERROR: schema.prisma has changes not covered by a migration."
    echo "[start]   Run 'prisma migrate dev --create-only' locally, commit, redeploy."
    exit 1
  else
    echo "[start] WARNING: drift check failed to run (exit $DIFF_EXIT), skipping."
  fi
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
ALTER TABLE "customer_passes" ADD COLUMN IF NOT EXISTS "birthdayNotifiedOn" TEXT;
SQL
echo "[start] failsafe columns: OK"

echo "[start] ── Running superadmin setup ─────────────────────────────────"
npx ts-node --project tsconfig.seed.json scripts/create-superadmin.ts
echo "[start] superadmin: OK"

echo "[start] ── Starting Next.js ──────────────────────────────────────────"
exec npx next start
