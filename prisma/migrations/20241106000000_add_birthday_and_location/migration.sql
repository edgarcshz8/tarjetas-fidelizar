-- AlterTable: add location fields to businesses
ALTER TABLE "businesses" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "businesses" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "businesses" ADD COLUMN "locationName" TEXT;

-- AlterTable: add birthDate to customers
ALTER TABLE "customers" ADD COLUMN "birthDate" TIMESTAMP(3);
