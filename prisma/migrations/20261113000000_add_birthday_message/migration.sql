-- AlterTable: add customizable birthday message fields to loyalty_programs
ALTER TABLE "loyalty_programs" ADD COLUMN IF NOT EXISTS "birthdayTitle"   TEXT;
ALTER TABLE "loyalty_programs" ADD COLUMN IF NOT EXISTS "birthdayMessage" TEXT;
