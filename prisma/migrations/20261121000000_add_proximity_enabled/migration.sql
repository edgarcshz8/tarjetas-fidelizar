-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "address" TEXT;
ALTER TABLE "businesses" ADD COLUMN "proximityEnabled" BOOLEAN NOT NULL DEFAULT true;
