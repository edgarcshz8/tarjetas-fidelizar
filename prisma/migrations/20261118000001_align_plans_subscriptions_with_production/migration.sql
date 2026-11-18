-- Migration: 20261118000001_align_plans_subscriptions_with_production
-- Aligns schema with real production DB state.
-- The previous migration (20261118000000) was recorded as applied but its SQL never ran.
-- Every statement uses IF NOT EXISTS / ADD VALUE IF NOT EXISTS to be safe on re-run.

-- ── 1. PlanInterval enum ─────────────────────────────────────────────────────
-- May not exist since 20261118000000 never ran.
DO $$ BEGIN
  CREATE TYPE "PlanInterval" AS ENUM ('MONTHLY', 'ANNUAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── 2. SubscriptionStatus: add values expected by schema ─────────────────────
-- Production enum already has at least PENDING; schema also needs these four.
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ── 3. plans: add columns missing from production ────────────────────────────
-- production has: id, name, priceClp, intervalDays, isActive, createdAt
-- schema expects additionally: description, interval, features, mpPlanId, updatedAt
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "interval"    "PlanInterval" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "features"    JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "mpPlanId"    TEXT;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── 4. subscriptions: add unique indexes ─────────────────────────────────────
-- Production has non-unique indexes; schema declares both fields as @unique.
-- Adding the unique indexes alongside the existing non-unique ones is safe.
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_businessId_key"
    ON "subscriptions"("businessId");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_mpSubscriptionId_key"
    ON "subscriptions"("mpSubscriptionId");

-- ── 5. webhook_events: create if not exists ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id"          TEXT         NOT NULL,
    "mpEventId"   TEXT         NOT NULL,
    "type"        TEXT         NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_mpEventId_key"
    ON "webhook_events"("mpEventId");
