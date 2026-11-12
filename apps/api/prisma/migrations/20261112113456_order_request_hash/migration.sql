-- AlterTable
ALTER TABLE `orders` ADD COLUMN `request_hash` CHAR(64) NOT NULL DEFAULT '';
