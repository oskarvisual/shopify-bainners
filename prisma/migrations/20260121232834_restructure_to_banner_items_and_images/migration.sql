/*
  Warnings:

  - You are about to drop the `BannerImage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `BannerImage` DROP FOREIGN KEY `BannerImage_bannerId_fkey`;

-- DropForeignKey
ALTER TABLE `BannerImage` DROP FOREIGN KEY `BannerImage_generationRequestId_fkey`;

-- DropForeignKey
ALTER TABLE `BannerImage` DROP FOREIGN KEY `BannerImage_shopId_fkey`;

-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `displayOrder` INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE `BannerImage`;

-- CreateTable
CREATE TABLE `BannerItem` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `bannerId` VARCHAR(191) NOT NULL,
    `imageId` VARCHAR(191) NULL,
    `externalImageUrl` TEXT NULL,
    `title` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `isSelected` BOOLEAN NOT NULL DEFAULT false,
    `variantIndex` INTEGER NULL,
    `alt` VARCHAR(255) NULL,
    `tags` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BannerItem_shopId_idx`(`shopId`),
    INDEX `BannerItem_bannerId_idx`(`bannerId`),
    INDEX `BannerItem_imageId_idx`(`imageId`),
    INDEX `BannerItem_displayOrder_idx`(`displayOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Image` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `storageUrl` TEXT NOT NULL,
    `sizeInMB` DOUBLE NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `aspectRatio` VARCHAR(20) NOT NULL,
    `format` VARCHAR(10) NOT NULL,
    `sourceType` VARCHAR(50) NOT NULL,
    `generationRequestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Image_shopId_idx`(`shopId`),
    INDEX `Image_sourceType_idx`(`sourceType`),
    INDEX `Image_createdAt_idx`(`createdAt`),
    INDEX `Image_generationRequestId_idx`(`generationRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BannerItem` ADD CONSTRAINT `BannerItem_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerItem` ADD CONSTRAINT `BannerItem_bannerId_fkey` FOREIGN KEY (`bannerId`) REFERENCES `Banner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerItem` ADD CONSTRAINT `BannerItem_imageId_fkey` FOREIGN KEY (`imageId`) REFERENCES `Image`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Image` ADD CONSTRAINT `Image_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Image` ADD CONSTRAINT `Image_generationRequestId_fkey` FOREIGN KEY (`generationRequestId`) REFERENCES `GenerationRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
