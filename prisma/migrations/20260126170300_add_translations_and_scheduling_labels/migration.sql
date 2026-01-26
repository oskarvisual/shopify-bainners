-- AlterTable
ALTER TABLE `Shop` ADD COLUMN `defaultTranslationCouponCopied` VARCHAR(100) NULL,
    ADD COLUMN `defaultTranslationDays` VARCHAR(30) NULL,
    ADD COLUMN `defaultTranslationHours` VARCHAR(30) NULL,
    ADD COLUMN `defaultTranslationMinutes` VARCHAR(30) NULL,
    ADD COLUMN `defaultTranslationSeconds` VARCHAR(30) NULL;
