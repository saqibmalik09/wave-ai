-- AlterTable: Google OAuth support (nullable password for Google-only users)
ALTER TABLE `users` MODIFY `passwordHash` VARCHAR(512) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `googleId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_googleId_key` ON `users`(`googleId`);
