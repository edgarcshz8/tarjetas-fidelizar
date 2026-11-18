-- =============================================================================
-- reset-billing-tables.sql
-- Borra y recrea las tablas de facturación de Mercado Pago desde cero.
--
-- CUÁNDO USAR:
--   Solo cuando quieras limpiar datos de prueba y partir de cero.
--   Las tablas de loyalty (businesses, customers, stamps, etc.) NO se tocan.
--
-- CÓMO CORRER (elige una opción):
--
--   Opción A — psql directo:
--     psql "$DATABASE_URL" -f scripts/reset-billing-tables.sql
--
--   Opción B — Prisma db execute:
--     npx prisma db execute --schema prisma/schema.prisma --file scripts/reset-billing-tables.sql
--
-- DESPUÉS DE CORRER ESTE SCRIPT:
--   1. Borra el registro de la migración en _prisma_migrations:
--        DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118000000_add_subscription_plans';
--   2. En el próximo deploy, `prisma migrate deploy` la reaplicará automáticamente.
--   3. Corre `npm run db:seed` una vez para volver a crear los planes.
-- =============================================================================

BEGIN;

-- ── 1. Tablas (subscriptions primero por FK a plans) ─────────────────────────
DROP TABLE IF EXISTS "webhook_events"  CASCADE;
DROP TABLE IF EXISTS "subscriptions"   CASCADE;
DROP TABLE IF EXISTS "plans"           CASCADE;

-- ── 2. Enums (solo después de borrar las tablas que los usan) ─────────────────
DROP TYPE IF EXISTS "SubscriptionStatus";
DROP TYPE IF EXISTS "PlanInterval";

-- ── 3. Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE "PlanInterval" AS ENUM ('MONTHLY', 'ANNUAL');

CREATE TYPE "SubscriptionStatus" AS ENUM (
    'PENDING',
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELLED'
);

-- ── 4. Tabla plans ────────────────────────────────────────────────────────────
CREATE TABLE "plans" (
    "id"           TEXT           NOT NULL,
    "name"         TEXT           NOT NULL,
    "description"  TEXT,
    "priceClp"     INTEGER        NOT NULL,
    "intervalDays" INTEGER        NOT NULL DEFAULT 30,
    "interval"     "PlanInterval" NOT NULL DEFAULT 'MONTHLY',
    "features"     JSONB          NOT NULL DEFAULT '[]',
    "mpPlanId"     TEXT,
    "isActive"     BOOLEAN        NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- ── 5. Tabla subscriptions ────────────────────────────────────────────────────
CREATE TABLE "subscriptions" (
    "id"                 TEXT                 NOT NULL,
    "businessId"         TEXT                 NOT NULL,
    "planId"             TEXT                 NOT NULL,
    "status"             "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "mpSubscriptionId"   TEXT,
    "mpPreapprovalId"    TEXT,
    "mpPayerId"          TEXT,
    "mpStatusDetail"     TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd"   TIMESTAMP(3),
    "canceledAt"         TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- ── 6. Tabla webhook_events ───────────────────────────────────────────────────
CREATE TABLE "webhook_events" (
    "id"          TEXT         NOT NULL,
    "mpEventId"   TEXT         NOT NULL,
    "type"        TEXT         NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- ── 7. Índices únicos ─────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "subscriptions_businessId_key"
    ON "subscriptions"("businessId");

CREATE UNIQUE INDEX "subscriptions_mpSubscriptionId_key"
    ON "subscriptions"("mpSubscriptionId");

CREATE UNIQUE INDEX "webhook_events_mpEventId_key"
    ON "webhook_events"("mpEventId");

-- ── 8. Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
