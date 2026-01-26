-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `announcementContentOrder` JSON NULL,
    ADD COLUMN `announcementContentSpacing` INTEGER NULL,
    ADD COLUMN `announcementLayout` VARCHAR(20) NULL,
    ADD COLUMN `announcementShowCta` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `announcementShowText` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `Shop` ADD COLUMN `defaultAnnouncementContentSpacing` INTEGER NULL,
    ADD COLUMN `defaultAnnouncementLayout` VARCHAR(20) NULL,
    ADD COLUMN `defaultAnnouncementShowCta` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `defaultAnnouncementShowText` BOOLEAN NOT NULL DEFAULT true;
