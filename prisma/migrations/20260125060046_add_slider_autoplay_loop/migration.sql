-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `sliderAutoplay` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sliderLoop` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `sliderPerView` DOUBLE NOT NULL DEFAULT 1,
    ADD COLUMN `sliderShowArrows` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `sliderShowBullets` BOOLEAN NOT NULL DEFAULT true;
