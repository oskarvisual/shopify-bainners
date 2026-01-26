-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `announcementCountdownShowLabels` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `announcementSeparatorEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `announcementSeparatorText` VARCHAR(10) NULL,
    ADD COLUMN `ctaUnderline` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Shop` ADD COLUMN `defaultCtaStyle` VARCHAR(20) NULL,
    ADD COLUMN `defaultCtaUnderline` BOOLEAN NOT NULL DEFAULT false;
