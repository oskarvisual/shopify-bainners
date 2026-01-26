-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `announcementCtaTarget` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `Shop` ADD COLUMN `defaultAnnouncementAnimation` VARCHAR(20) NULL,
    ADD COLUMN `defaultAnnouncementClosable` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `defaultAnnouncementCloseColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultAnnouncementMarquee` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `defaultBannerBackgroundColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultCountdownBackgroundColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultCountdownStyle` VARCHAR(20) NULL,
    ADD COLUMN `defaultCountdownTextColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultCtaBackgroundColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultCtaBorderColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultCtaBordered` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `defaultCtaRounded` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `defaultCtaShadow` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `defaultCtaTextColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultDescriptionColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultDescriptionFontSize` VARCHAR(20) NULL,
    ADD COLUMN `defaultSliderArrowColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultSliderArrowStyle` VARCHAR(20) NULL,
    ADD COLUMN `defaultSliderBulletColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultTitleColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultTitleFontSize` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `BannerItemAnalytic` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `bannerItemId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `ctr` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BannerItemAnalytic_shopId_idx`(`shopId`),
    INDEX `BannerItemAnalytic_bannerItemId_idx`(`bannerItemId`),
    INDEX `BannerItemAnalytic_date_idx`(`date`),
    UNIQUE INDEX `BannerItemAnalytic_bannerItemId_date_key`(`bannerItemId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BannerEvent` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `bannerId` VARCHAR(191) NOT NULL,
    `bannerItemId` VARCHAR(191) NULL,
    `eventType` VARCHAR(20) NOT NULL,
    `pageUrl` TEXT NULL,
    `pagePath` TEXT NULL,
    `referrer` TEXT NULL,
    `userAgent` TEXT NULL,
    `device` VARCHAR(20) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BannerEvent_shopId_idx`(`shopId`),
    INDEX `BannerEvent_bannerId_idx`(`bannerId`),
    INDEX `BannerEvent_bannerItemId_idx`(`bannerItemId`),
    INDEX `BannerEvent_eventType_idx`(`eventType`),
    INDEX `BannerEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BannerItemAnalytic` ADD CONSTRAINT `BannerItemAnalytic_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerItemAnalytic` ADD CONSTRAINT `BannerItemAnalytic_bannerItemId_fkey` FOREIGN KEY (`bannerItemId`) REFERENCES `BannerItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerEvent` ADD CONSTRAINT `BannerEvent_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerEvent` ADD CONSTRAINT `BannerEvent_bannerId_fkey` FOREIGN KEY (`bannerId`) REFERENCES `Banner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerEvent` ADD CONSTRAINT `BannerEvent_bannerItemId_fkey` FOREIGN KEY (`bannerItemId`) REFERENCES `BannerItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
