-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `announcementCouponBackgroundColor` VARCHAR(20) NULL,
    ADD COLUMN `announcementCouponBorderColor` VARCHAR(20) NULL,
    ADD COLUMN `announcementCouponCode` VARCHAR(100) NULL,
    ADD COLUMN `announcementCouponTextColor` VARCHAR(20) NULL,
    ADD COLUMN `announcementShowCoupon` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Shop` ADD COLUMN `defaultAnnouncementCouponBackgroundColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultAnnouncementCouponBorderColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultAnnouncementCouponTextColor` VARCHAR(20) NULL,
    ADD COLUMN `defaultAnnouncementShowCoupon` BOOLEAN NOT NULL DEFAULT false;
