-- AlterTable
ALTER TABLE `command_logs` ADD COLUMN `language` VARCHAR(5) NOT NULL DEFAULT 'en',
    ADD COLUMN `summary` VARCHAR(500) NULL;
