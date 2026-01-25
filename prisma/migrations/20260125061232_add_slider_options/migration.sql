-- AlterTable
ALTER TABLE `Banner` ADD COLUMN `sliderAutoplayDelay` INTEGER NULL,
    ADD COLUMN `sliderCentered` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `sliderPauseOnHover` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `sliderSpaceBetween` INTEGER NULL,
    ADD COLUMN `sliderSpeed` VARCHAR(20) NULL;
