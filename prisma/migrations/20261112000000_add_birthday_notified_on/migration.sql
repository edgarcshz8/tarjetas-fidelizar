-- AlterTable: día en que se notificó el cumpleaños (idempotencia del cron)
ALTER TABLE "customer_passes" ADD COLUMN IF NOT EXISTS "birthdayNotifiedOn" TEXT;
