-- AlterTable
ALTER TABLE "RestockSubscription" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- AlterTable: button text moved to the widget metafield; this column was no longer read.
ALTER TABLE "ShopSettings" DROP COLUMN "buttonText";
