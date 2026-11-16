-- CreateTable
CREATE TABLE `store_daily_stats` (
    `store_id` CHAR(36) NOT NULL,
    `getorio_tenant_id` VARCHAR(64) NOT NULL,
    `day` DATE NOT NULL,
    `visits` INTEGER NOT NULL DEFAULT 0,
    `page_views` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`store_id`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `store_daily_stats` ADD CONSTRAINT `store_daily_stats_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
