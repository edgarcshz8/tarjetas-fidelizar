-- Migration: 20261118000000_add_subscription_plans
-- Creates billing tables from scratch (Mercado Pago Suscripciones / preapproval API).
-- Generated with: npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- (billing section only — core tables were created by earlier migrations)

-- CreateEnum
CREATE TYPE "PlanInterval" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "plans" (
    "id"           TEXT          NOT NULL,
    "name"         TEXT          NOT NULL,
    "description"  TEXT,
    "priceClp"     INTEGER       NOT NULL,
    "intervalDays" INTEGER       NOT NULL DEFAULT 30,
    "interval"     "PlanInterval" NOT NULL DEFAULT 'MONTHLY',
    "features"     JSONB         NOT NULL DEFAULT '[]',
    "mpPlanId"     TEXT,
    "isActive"     BOOLEAN       NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id"                 TEXT                NOT NULL,
    "businessId"         TEXT                NOT NULL,
    "planId"             TEXT                NOT NULL,
    "status"             "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "mpSubscriptionId"   TEXT,
    "mpPreapprovalId"    TEXT,
    "mpPayerId"          TEXT,
    "mpStatusDetail"     TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd"   TIMESTAMP(3),
    "canceledAt"         TIMESTAMP(3),
    "createdAt"          TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)        NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id"          TEXT         NOT NULL,
    "mpEventId"   TEXT         NOT NULL,
    "type"        TEXT         NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_businessId_key"       ON "subscriptions"("businessId");
CREATE UNIQUE INDEX "subscriptions_mpSubscriptionId_key" ON "subscriptions"("mpSubscriptionId");
CREATE UNIQUE INDEX "webhook_events_mpEventId_key"       ON "webhook_events"("mpEventId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
