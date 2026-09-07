-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "DiscountAppliesTo" AS ENUM ('EVERYTHING', 'SERVICES', 'PRODUCTS');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountCode" VARCHAR(40);

-- CreateTable
CREATE TABLE "discounts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "description" VARCHAR(240),
    "type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "currency" "Currency",
    "appliesTo" "DiscountAppliesTo" NOT NULL DEFAULT 'EVERYTHING',
    "serviceIds" UUID[],
    "productIds" UUID[],
    "minSubtotal" INTEGER NOT NULL DEFAULT 0,
    "maxDiscount" INTEGER NOT NULL DEFAULT 0,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "perClientLimit" INTEGER,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_redemptions" (
    "id" UUID NOT NULL,
    "discountId" UUID NOT NULL,
    "userId" UUID,
    "bookingId" UUID,
    "orderId" UUID,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discounts_code_key" ON "discounts"("code");

-- CreateIndex
CREATE INDEX "discounts_code_idx" ON "discounts"("code");

-- CreateIndex
CREATE INDEX "discounts_isActive_startsAt_endsAt_idx" ON "discounts"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "discount_redemptions_bookingId_key" ON "discount_redemptions"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "discount_redemptions_orderId_key" ON "discount_redemptions"("orderId");

-- CreateIndex
CREATE INDEX "discount_redemptions_discountId_userId_idx" ON "discount_redemptions"("discountId", "userId");

-- AddForeignKey
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
