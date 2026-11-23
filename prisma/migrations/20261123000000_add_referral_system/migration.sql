-- AlterTable loyalty_programs: referral bonus stamps
ALTER TABLE "loyalty_programs" ADD COLUMN "referralBonusStamps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable customer_passes: referral code
ALTER TABLE "customer_passes" ADD COLUMN "referralCode" TEXT;
CREATE UNIQUE INDEX "customer_passes_referralCode_key" ON "customer_passes"("referralCode");

-- CreateTable referrals
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerPassId" TEXT NOT NULL,
    "referredPassId" TEXT NOT NULL,
    "bonusGranted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referrals_referredPassId_key" ON "referrals"("referredPassId");

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerPassId_fkey"
    FOREIGN KEY ("referrerPassId") REFERENCES "customer_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredPassId_fkey"
    FOREIGN KEY ("referredPassId") REFERENCES "customer_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
