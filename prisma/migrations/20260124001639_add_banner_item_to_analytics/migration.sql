/*
  Warnings:

  - You are about to drop the column `generationRequestId` on the `Image` table. All the data in the column will be lost.
  - You are about to drop the `GenerationRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `GenerationRequest` DROP FOREIGN KEY `GenerationRequest_bannerId_fkey`;

-- DropForeignKey
ALTER TABLE `GenerationRequest` DROP FOREIGN KEY `GenerationRequest_shopId_fkey`;

-- DropForeignKey
ALTER TABLE `GenerationRequest` DROP FOREIGN KEY `GenerationRequest_styleId_fkey`;

-- DropForeignKey
ALTER TABLE `Image` DROP FOREIGN KEY `Image_generationRequestId_fkey`;

-- DropIndex
DROP INDEX `Image_generationRequestId_idx` ON `Image`;

-- AlterTable
ALTER TABLE `BannerAnalytic` ADD COLUMN `bannerItemId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Image` DROP COLUMN `generationRequestId`;

-- DropTable
DROP TABLE `GenerationRequest`;

-- CreateIndex
CREATE INDEX `BannerAnalytic_bannerItemId_idx` ON `BannerAnalytic`(`bannerItemId`);

-- AddForeignKey
ALTER TABLE `BannerAnalytic` ADD CONSTRAINT `BannerAnalytic_bannerItemId_fkey` FOREIGN KEY (`bannerItemId`) REFERENCES `BannerItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
