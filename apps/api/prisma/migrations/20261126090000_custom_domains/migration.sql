-- AlterTable
ALTER TABLE `domains` ADD COLUMN `verification_token` VARCHAR(64) NULL,
    ADD COLUMN `verified_at` DATETIME(3) NULL,
    ADD COLUMN `last_checked_at` DATETIME(3) NULL,
    ADD COLUMN `last_check_error` VARCHAR(255) NULL;
