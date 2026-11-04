CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "secondaryColor" TEXT NOT NULL DEFAULT '#ffffff',
    "accentColor" TEXT NOT NULL DEFAULT '#e94560',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "loyalty_programs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stampsRequired" INTEGER NOT NULL DEFAULT 10,
    "rewardDescription" TEXT NOT NULL,
    "stampIconUrl" TEXT,
    "rewardIconUrl" TEXT,
    "logoUrl" TEXT,
    "backgroundColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "foregroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "labelColor" TEXT NOT NULL DEFAULT '#cccccc',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "googleClassId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_passes" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "currentStamps" INTEGER NOT NULL DEFAULT 0,
    "totalRewardsEarned" INTEGER NOT NULL DEFAULT 0,
    "rewardReady" BOOLEAN NOT NULL DEFAULT false,
    "applePassUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "googleObjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_passes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "apple_devices" (
    "id" TEXT NOT NULL,
    "deviceLibraryIdentifier" TEXT NOT NULL,
    "passSerialNumber" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "apple_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stamps" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stamps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");
CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");
CREATE UNIQUE INDEX "customer_passes_serialNumber_key" ON "customer_passes"("serialNumber");
CREATE UNIQUE INDEX "apple_devices_deviceLibraryIdentifier_passSerialNumber_key" ON "apple_devices"("deviceLibraryIdentifier", "passSerialNumber");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Foreign keys
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_passes" ADD CONSTRAINT "customer_passes_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_passes" ADD CONSTRAINT "customer_passes_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "loyalty_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "apple_devices" ADD CONSTRAINT "apple_devices_passSerialNumber_fkey"
    FOREIGN KEY ("passSerialNumber") REFERENCES "customer_passes"("serialNumber") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stamps" ADD CONSTRAINT "stamps_passId_fkey"
    FOREIGN KEY ("passId") REFERENCES "customer_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stamps" ADD CONSTRAINT "stamps_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "users"("id") ON UPDATE CASCADE;

ALTER TABLE "users" ADD CONSTRAINT "users_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
