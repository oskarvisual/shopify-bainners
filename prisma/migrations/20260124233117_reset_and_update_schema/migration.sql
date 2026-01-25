-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `announcementCountdownDurationHours` VARCHAR(20) NULL,
    ADD COLUMN `announcementCountdownEndAt` DATETIME(3) NULL,
    ADD COLUMN `announcementCountdownMode` VARCHAR(50) NULL,
    ADD COLUMN `announcementCountdownTimezone` VARCHAR(64) NULL,
    ADD COLUMN `announcementCtaText` VARCHAR(100) NULL,
    ADD COLUMN `announcementCtaUrl` TEXT NULL,
    ADD COLUMN `announcementShowCountdown` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `announcementText` TEXT NULL,
    ADD COLUMN `sliderType` VARCHAR(50) NULL;

-- AlterTable
ALTER TABLE `Shop` ADD COLUMN `setupGuideDismissedAt` DATETIME(3) NULL;
