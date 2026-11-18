-- Migration: 20261118000000_add_subscription_plans
-- Adds billing models for Mercado Pago Suscripciones (preapproval API).
-- Applied automatically by `prisma migrate deploy` in scripts/start.sh on boot.

-- Enums
CREATE TYPE "PlanInterval" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- Plans table
CREATE TABLE "plans" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "price"       INTEGER NOT NULL,
    "interval"    "PlanInterval" NOT NULL DEFAULT 'MONTHLY',
    "features"    JSONB NOT NULL DEFAULT '[]',
    "mpPlanId"    TEXT,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- Subscriptions table
CREATE TABLE "subscriptions" (
    "id"                 TEXT NOT NULL,
    "businessId"         TEXT NOT NULL,
    "planId"             TEXT NOT NULL,
    "status"             "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "mpSubscriptionId"   TEXT,
    "mpPayerId"          TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd"   TIMESTAMP(3),
    "canceledAt"         TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- WebhookEvents table (idempotency deduplication — Rule 3)
CREATE TABLE "webhook_events" (
    "id"          TEXT NOT NULL,
    "mpEventId"   TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "subscriptions_businessId_key" ON "subscriptions"("businessId");
CREATE UNIQUE INDEX "subscriptions_mpSubscriptionId_key" ON "subscriptions"("mpSubscriptionId");
CREATE UNIQUE INDEX "webhook_events_mpEventId_key" ON "webhook_events"("mpEventId");

-- Foreign keys
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans"("id") ON UPDATE CASCADE;
