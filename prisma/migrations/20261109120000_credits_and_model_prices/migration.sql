-- Credits metering + swappable model price catalogue.
--
-- Additive only: no column is dropped or renamed, plans.messageQuota stays
-- exactly as it was for older clients, and PlanInterval gains QUARTER as the
-- LAST enum member so existing ordinals are untouched.
--
-- New: model_prices (price catalogue, provider is data), credit_ledger
-- (idempotent reserve/settle/refund trail) and weekly_usage (per-ISO-week
-- counter keyed on Monday 00:00 UTC).
--
-- Apply with prisma migrate deploy only.

-- AlterTable
ALTER TABLE `plans` ADD COLUMN `creditsPerPeriod` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `weeklyCredits` INTEGER NOT NULL DEFAULT 0,
    MODIFY `interval` ENUM('FREE', 'MONTH', 'YEAR', 'LIFETIME', 'QUARTER') NOT NULL DEFAULT 'FREE';

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `creditsGranted` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `creditsUsed` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `model_prices` (
    `id` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `modelId` VARCHAR(191) NOT NULL,
    `modality` ENUM('IMAGE', 'VIDEO', 'CHAT') NOT NULL,
    `resolution` VARCHAR(191) NULL,
    `unit` ENUM('SECOND', 'IMAGE', 'TOKEN') NOT NULL,
    `credits` INTEGER NOT NULL,
    `supportsReference` BOOLEAN NOT NULL DEFAULT false,
    `label` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `model_prices_active_modality_idx`(`active`, `modality`),
    UNIQUE INDEX `model_prices_providerId_modelId_resolution_key`(`providerId`, `modelId`, `resolution`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_ledger` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NULL,
    `kind` ENUM('CHAT', 'IMAGE', 'VIDEO', 'ADJUST') NOT NULL,
    `estimatedCredits` INTEGER NOT NULL,
    `actualCredits` INTEGER NULL,
    `costTicks` BIGINT NULL,
    `status` ENUM('RESERVED', 'SETTLED', 'REFUNDED', 'FAILED') NOT NULL DEFAULT 'RESERVED',
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NULL,
    `providerRequestId` VARCHAR(191) NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `credit_ledger_idempotencyKey_key`(`idempotencyKey`),
    INDEX `credit_ledger_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `credit_ledger_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weekly_usage` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `weekStart` DATE NOT NULL,
    `creditsUsed` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `weekly_usage_userId_weekStart_key`(`userId`, `weekStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `credit_ledger` ADD CONSTRAINT `credit_ledger_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_usage` ADD CONSTRAINT `weekly_usage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

