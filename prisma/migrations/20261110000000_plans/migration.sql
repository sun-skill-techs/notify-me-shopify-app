-- AlterTable
ALTER TABLE "RestockSubscription" ADD COLUMN "clickedAt" TIMESTAMP(3),
ADD COLUMN "orderId" TEXT,
ADD COLUMN "orderValue" DECIMAL(12,2),
ADD COLUMN "orderCurrency" TEXT,
ADD COLUMN "orderedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN "planCheckedAt" TIMESTAMP(3),
ADD COLUMN "shopGid" TEXT,
ADD COLUMN "grandfathered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "usageMonth" TEXT NOT NULL DEFAULT '',
ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "renotify" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailButtonColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN "emailLogoUrl" TEXT NOT NULL DEFAULT '';

-- Every store installed before paid plans launched keeps Basic for free.
INSERT INTO "ShopSettings" ("shop", "updatedAt", "grandfathered")
SELECT DISTINCT "shop", CURRENT_TIMESTAMP, true FROM "Session"
ON CONFLICT ("shop") DO UPDATE SET "grandfathered" = true;
