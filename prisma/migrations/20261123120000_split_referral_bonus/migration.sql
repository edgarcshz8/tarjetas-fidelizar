-- Rename referralBonusStamps → referralBonusReferrer, add referralBonusReferred
ALTER TABLE "loyalty_programs" RENAME COLUMN "referralBonusStamps" TO "referralBonusReferrer";
ALTER TABLE "loyalty_programs" ADD COLUMN "referralBonusReferred" INTEGER NOT NULL DEFAULT 0;
