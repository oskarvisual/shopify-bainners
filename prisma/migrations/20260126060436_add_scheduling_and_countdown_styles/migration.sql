-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `countdownFontSize` VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE `BannerItem` ADD COLUMN `scheduledEndAt` DATETIME(3) NULL,
    ADD COLUMN `scheduledStartAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Shop` ADD COLUMN `defaultCountdownFontSize` VARCHAR(20) NULL;
