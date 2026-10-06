-- Emails become ciphertext; uniqueness moves to the keyed hash.
ALTER TABLE "RestockSubscription" ADD COLUMN "emailHash" TEXT;
DROP INDEX "RestockSubscription_shop_variantId_email_key";
CREATE UNIQUE INDEX "RestockSubscription_shop_variantId_emailHash_key" ON "RestockSubscription"("shop", "variantId", "emailHash");

CREATE TABLE "DataAccessLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "records" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataAccessLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DataAccessLog_shop_createdAt_idx" ON "DataAccessLog"("shop", "createdAt");
