-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(255) NOT NULL,
    `shop` VARCHAR(255) NOT NULL,
    `state` VARCHAR(255) NOT NULL,
    `isOnline` BOOLEAN NOT NULL DEFAULT false,
    `scope` TEXT NULL,
    `expires` DATETIME(3) NULL,
    `accessToken` TEXT NOT NULL,
    `userId` BIGINT NULL,
    `firstName` VARCHAR(255) NULL,
    `lastName` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `accountOwner` BOOLEAN NOT NULL DEFAULT false,
    `locale` VARCHAR(50) NULL,
    `collaborator` BOOLEAN NULL DEFAULT false,
    `emailVerified` BOOLEAN NULL DEFAULT false,
    `refreshToken` TEXT NULL,
    `refreshTokenExpires` DATETIME(3) NULL,

    INDEX `Session_shop_idx`(`shop`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shop` (
    `id` VARCHAR(191) NOT NULL,
    `shopDomain` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `plan` VARCHAR(50) NOT NULL DEFAULT 'free',
    `storageUsedGB` DOUBLE NOT NULL DEFAULT 0,
    `storageLimitGB` DOUBLE NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `installedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uninstalledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Shop_shopDomain_key`(`shopDomain`),
    INDEX `Shop_shopDomain_idx`(`shopDomain`),
    INDEX `Shop_plan_idx`(`plan`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Banner` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `descriptionInternal` TEXT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
    `layout` VARCHAR(50) NOT NULL,
    `scheduledStartAt` DATETIME(3) NULL,
    `scheduledEndAt` DATETIME(3) NULL,
    `ctaText` VARCHAR(100) NULL,
    `ctaUrl` TEXT NULL,
    `ctaTarget` VARCHAR(20) NULL,
    `ctaStyle` VARCHAR(50) NULL,
    `showCta` BOOLEAN NOT NULL DEFAULT true,
    `textMode` VARCHAR(50) NOT NULL DEFAULT 'overlay',
    `textTitle` VARCHAR(255) NULL,
    `textSubtitle` VARCHAR(255) NULL,
    `textPosition` VARCHAR(50) NULL,
    `textColors` JSON NULL,
    `productId` VARCHAR(255) NULL,
    `productTitle` VARCHAR(255) NULL,
    `productDescription` TEXT NULL,
    `collectionName` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Banner_shopId_idx`(`shopId`),
    INDEX `Banner_status_idx`(`status`),
    INDEX `Banner_layout_idx`(`layout`),
    INDEX `Banner_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BannerImage` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `bannerId` VARCHAR(191) NULL,
    `sourceType` VARCHAR(50) NOT NULL,
    `storageUrl` TEXT NULL,
    `shopifyImageUrl` TEXT NULL,
    `sizeInMB` DOUBLE NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `aspectRatio` VARCHAR(20) NOT NULL,
    `format` VARCHAR(10) NOT NULL,
    `isSelected` BOOLEAN NOT NULL DEFAULT false,
    `variantIndex` INTEGER NULL,
    `alt` VARCHAR(255) NULL,
    `tags` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `generationRequestId` VARCHAR(191) NULL,

    INDEX `BannerImage_shopId_idx`(`shopId`),
    INDEX `BannerImage_bannerId_idx`(`bannerId`),
    INDEX `BannerImage_sourceType_idx`(`sourceType`),
    INDEX `BannerImage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Style` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(100) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'draft',
    `description` TEXT NULL,
    `stylePrompt` TEXT NOT NULL,
    `negativePrompt` TEXT NULL,
    `toneKeywords` JSON NULL,
    `avoidTextInImage` BOOLEAN NOT NULL DEFAULT true,
    `strictProductPreservation` BOOLEAN NOT NULL DEFAULT true,
    `defaultComposition` VARCHAR(50) NULL,
    `backgroundStyle` VARCHAR(50) NULL,
    `cameraFeel` VARCHAR(50) NULL,
    `depthOfField` VARCHAR(50) NULL,
    `safeAreaProfile` VARCHAR(50) NULL,
    `primaryColor` VARCHAR(7) NULL,
    `accentColor` VARCHAR(7) NULL,
    `backgroundColorHint` VARCHAR(7) NULL,
    `allowGradients` BOOLEAN NOT NULL DEFAULT true,
    `logoUsage` VARCHAR(50) NULL,
    `defaultAspectRatios` JSON NULL,
    `defaultResolution` VARCHAR(50) NULL,
    `outputFormat` VARCHAR(10) NOT NULL DEFAULT 'webp',
    `compressionTarget` VARCHAR(50) NULL,
    `complianceRules` JSON NULL,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Style_shopId_idx`(`shopId`),
    INDEX `Style_status_idx`(`status`),
    INDEX `Style_category_idx`(`category`),
    INDEX `Style_isDefault_idx`(`isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GenerationRequest` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `bannerId` VARCHAR(191) NULL,
    `styleId` VARCHAR(191) NULL,
    `userPrompt` TEXT NOT NULL,
    `productContext` JSON NULL,
    `referenceImages` JSON NULL,
    `format` VARCHAR(20) NOT NULL,
    `dimensions` VARCHAR(50) NOT NULL,
    `variantsRequested` INTEGER NOT NULL DEFAULT 2,
    `textMode` VARCHAR(50) NOT NULL,
    `compositionSettings` JSON NULL,
    `variantsGenerated` INTEGER NOT NULL DEFAULT 0,
    `selectedVariantIndex` INTEGER NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `errorMessage` TEXT NULL,
    `webhookUrl` TEXT NULL,
    `webhookResponse` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `GenerationRequest_shopId_idx`(`shopId`),
    INDEX `GenerationRequest_bannerId_idx`(`bannerId`),
    INDEX `GenerationRequest_status_idx`(`status`),
    INDEX `GenerationRequest_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BannerAnalytic` (
    `id` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `bannerId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `ctr` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BannerAnalytic_shopId_idx`(`shopId`),
    INDEX `BannerAnalytic_bannerId_idx`(`bannerId`),
    INDEX `BannerAnalytic_date_idx`(`date`),
    UNIQUE INDEX `BannerAnalytic_bannerId_date_key`(`bannerId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Banner` ADD CONSTRAINT `Banner_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerImage` ADD CONSTRAINT `BannerImage_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerImage` ADD CONSTRAINT `BannerImage_bannerId_fkey` FOREIGN KEY (`bannerId`) REFERENCES `Banner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerImage` ADD CONSTRAINT `BannerImage_generationRequestId_fkey` FOREIGN KEY (`generationRequestId`) REFERENCES `GenerationRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Style` ADD CONSTRAINT `Style_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GenerationRequest` ADD CONSTRAINT `GenerationRequest_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GenerationRequest` ADD CONSTRAINT `GenerationRequest_bannerId_fkey` FOREIGN KEY (`bannerId`) REFERENCES `Banner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GenerationRequest` ADD CONSTRAINT `GenerationRequest_styleId_fkey` FOREIGN KEY (`styleId`) REFERENCES `Style`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerAnalytic` ADD CONSTRAINT `BannerAnalytic_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BannerAnalytic` ADD CONSTRAINT `BannerAnalytic_bannerId_fkey` FOREIGN KEY (`bannerId`) REFERENCES `Banner`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
